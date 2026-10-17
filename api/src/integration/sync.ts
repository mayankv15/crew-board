import type { SyncRun } from '@crew-board/shared';
import type { Db } from '../db/connection.ts';
import { createRun, failInterruptedRuns, getRun, saveProgress, type RunProgress } from '../repositories/syncRuns.ts';
import { deactivateTechnician, upsertTechnician } from '../repositories/upsert.ts';
import { nowIso } from '../repositories/util.ts';
import type { HrClient } from './hrClient.ts';
import { HrUserSchema, toTechnicianInput } from './mapping.ts';

export interface SyncDeps {
  db: Db;
  hr: HrClient;
  log: { info: (o: object, m: string) => void; error: (o: object, m: string) => void };
  pageSize?: number;
}

const MAX_ERRORS = 100;
const MAX_PAGES = 500;
// Never deactivate more than this share of active technicians because HR "stopped listing" them:
// an empty or truncated answer from the partner must not wipe the roster.
const MAX_DEACTIVATE_SHARE = 0.2;

type Outcome = 'created' | 'updated' | 'unchanged';

// Starts a run and returns at once with its id; `done` resolves with the final run.
// createRun throws SYNC_IN_PROGRESS when another run is active.
export function startSync(deps: SyncDeps, trigger: 'api' | 'cli'): { runId: string; done: Promise<SyncRun> } {
  const run = createRun(deps.db, trigger);
  const done = execute(deps, run).catch((e: unknown) => {
    // Last resort: record the crash on the run so it never stays "running" forever.
    deps.log.error({ err: e, runId: run.id }, 'sync crashed');
    const current = getRun(deps.db, run.id)!;
    saveProgress(deps.db, run.id, { ...current, errors: [...current.errors, { scope: 'run', message: String((e as Error).message) }] }, 'failed');
    return getRun(deps.db, run.id)!;
  });
  return { runId: run.id, done };
}

async function execute(deps: SyncDeps, run: SyncRun): Promise<SyncRun> {
  const { db, hr, log } = deps;
  const pageSize = deps.pageSize ?? 30;
  const progress: RunProgress = {
    pagesDone: 0, pagesTotal: null, created: 0, updated: 0, unchanged: 0, deactivated: 0, failed: 0, errors: [],
  };
  const seen = new Set<number>();
  let failedPages = 0;
  let succeededPages = 0;
  let droppedErrors = 0;

  const addError = (scope: string, message: string) => {
    if (progress.errors.length < MAX_ERRORS) progress.errors.push({ scope, message });
    else droppedErrors += 1;
  };

  let total: number | null = null;
  for (let skip = 0, n = 1; (total === null || skip < total) && n <= MAX_PAGES; skip += pageSize, n += 1) {
    let page;
    try {
      page = await hr.fetchPage(skip, pageSize);
    } catch (e) {
      failedPages += 1;
      addError(`page ${n}`, (e as Error).message);
      // Without a first page we do not know how many pages exist, so there is nothing more to try.
      if (total === null) break;
      progress.pagesDone += 1;
      saveProgress(db, run.id, progress);
      continue;
    }
    total = page.total;
    progress.pagesTotal = Math.ceil(total / pageSize);
    const fetchedAt = nowIso();

    // One transaction per page: fast, and a crash never leaves half a page written.
    db.transaction(() => {
      for (const raw of page.users) {
        const rawId = (raw as { id?: unknown } | null)?.id;
        // Count a record as "seen" even if it is malformed, so a bad record never causes the
        // technician it describes to be deactivated.
        if (typeof rawId === 'number') seen.add(rawId);
        const parsed = HrUserSchema.safeParse(raw);
        if (!parsed.success) {
          progress.failed += 1;
          addError(`technician ${typeof rawId === 'number' ? rawId : 'unknown'}`, parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
          continue;
        }
        try {
          const outcome = upsertTechnician(db, toTechnicianInput(parsed.data), fetchedAt, { source: 'sync' });
          progress[(outcome === 'stale' ? 'unchanged' : outcome) as Outcome] += 1;
        } catch (e) {
          progress.failed += 1;
          addError(`technician ${parsed.data.id}`, (e as Error).message);
        }
      }
    })();
    succeededPages += 1;
    progress.pagesDone += 1;
    saveProgress(db, run.id, progress);
  }

  const clean = failedPages === 0 && progress.failed === 0 && succeededPages > 0;
  if (clean) deactivateMissing(deps, run, seen, progress, addError);

  if (droppedErrors > 0) progress.errors.push({ scope: 'run', message: `${droppedErrors} more errors not shown` });
  const status: SyncRun['status'] = succeededPages === 0 ? 'failed' : failedPages > 0 || progress.failed > 0 || progress.errors.length > 0 ? 'partial' : 'succeeded';
  saveProgress(db, run.id, progress, status);
  const final = getRun(db, run.id)!;
  log.info({ runId: final.id, status, created: final.created, updated: final.updated, unchanged: final.unchanged, deactivated: final.deactivated, failed: final.failed }, 'sync finished');
  return final;
}

// Only reached after a run in which every page and every record succeeded.
function deactivateMissing(
  deps: SyncDeps,
  run: SyncRun,
  seen: Set<number>,
  progress: RunProgress,
  addError: (scope: string, message: string) => void,
): void {
  const { db } = deps;
  // hr_updated_at <= run start: someone a webhook created after we started is not "missing".
  const missing = (
    db.prepare('SELECT external_id FROM technicians WHERE active = 1 AND hr_updated_at <= ?').all(run.startedAt) as { external_id: number }[]
  ).map((r) => r.external_id).filter((id) => !seen.has(id));
  if (missing.length === 0) return;

  const activeCount = (db.prepare('SELECT COUNT(*) AS n FROM technicians WHERE active = 1').get() as { n: number }).n;
  if (missing.length > activeCount * MAX_DEACTIVATE_SHARE) {
    addError('deactivation', `Refused to deactivate ${missing.length} of ${activeCount} active technicians (limit ${MAX_DEACTIVATE_SHARE * 100}%). HR may have returned an incomplete list; nothing was deactivated.`);
    return;
  }
  const observedAt = nowIso();
  db.transaction(() => {
    for (const externalId of missing) {
      if (deactivateTechnician(db, externalId, observedAt, 'sync') === 'deactivated') progress.deactivated += 1;
    }
  })();
}

export { failInterruptedRuns };
