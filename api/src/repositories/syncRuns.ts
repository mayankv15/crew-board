import { randomUUID } from 'node:crypto';
import type { SyncRun } from '@crew-board/shared';
import type { Db } from '../db/connection.ts';
import { AppError } from '../errors.ts';
import { nowIso } from './util.ts';

interface RunRow {
  id: string;
  trigger: 'api' | 'cli';
  status: SyncRun['status'];
  started_at: string;
  finished_at: string | null;
  pages_done: number;
  pages_total: number | null;
  created: number;
  updated: number;
  unchanged: number;
  deactivated: number;
  failed: number;
  errors: string;
}

const toRun = (r: RunRow): SyncRun => ({
  id: r.id,
  trigger: r.trigger,
  status: r.status,
  startedAt: r.started_at,
  finishedAt: r.finished_at,
  pagesDone: r.pages_done,
  pagesTotal: r.pages_total,
  created: r.created,
  updated: r.updated,
  unchanged: r.unchanged,
  deactivated: r.deactivated,
  failed: r.failed,
  errors: JSON.parse(r.errors) as SyncRun['errors'],
});

export function getRun(db: Db, id: string): SyncRun | undefined {
  const row = db.prepare('SELECT * FROM sync_runs WHERE id = ?').get(id) as RunRow | undefined;
  return row && toRun(row);
}

export function listRuns(db: Db, limit: number): SyncRun[] {
  const rows = db.prepare('SELECT * FROM sync_runs ORDER BY started_at DESC, id LIMIT ?').all(limit) as RunRow[];
  return rows.map(toRun);
}

// Single flight: the check and the insert happen in one write transaction, so two triggers at the
// same moment cannot both start a run.
export function createRun(db: Db, trigger: 'api' | 'cli'): SyncRun {
  return db.transaction((): SyncRun => {
    const running = db.prepare("SELECT id FROM sync_runs WHERE status = 'running'").get() as { id: string } | undefined;
    if (running) {
      throw new AppError('SYNC_IN_PROGRESS', 'A sync is already running. Wait for it to finish, then try again.', {
        runId: running.id,
      });
    }
    const id = randomUUID();
    db.prepare("INSERT INTO sync_runs (id, trigger, status, started_at) VALUES (?, ?, 'running', ?)").run(id, trigger, nowIso());
    return getRun(db, id)!;
  }).immediate();
}

export type RunProgress = Pick<SyncRun, 'pagesDone' | 'pagesTotal' | 'created' | 'updated' | 'unchanged' | 'deactivated' | 'failed' | 'errors'>;

export function saveProgress(db: Db, id: string, p: RunProgress, finish?: SyncRun['status']): void {
  db.prepare(
    'UPDATE sync_runs SET pages_done = @pagesDone, pages_total = @pagesTotal, created = @created, updated = @updated, ' +
      'unchanged = @unchanged, deactivated = @deactivated, failed = @failed, errors = @errors, ' +
      'status = COALESCE(@status, status), finished_at = CASE WHEN @status IS NULL THEN finished_at ELSE @finishedAt END WHERE id = @id',
  ).run({ id, ...p, errors: JSON.stringify(p.errors), status: finish ?? null, finishedAt: nowIso() });
}

// A run still marked "running" at startup belongs to a process that died. Close it so the single
// flight guard does not block every future sync.
export function failInterruptedRuns(db: Db): number {
  const stale = db.prepare("SELECT id, errors FROM sync_runs WHERE status = 'running'").all() as { id: string; errors: string }[];
  for (const r of stale) {
    const errors = [...(JSON.parse(r.errors) as SyncRun['errors']), { scope: 'run', message: 'Interrupted: the server stopped before this run finished.' }];
    db.prepare("UPDATE sync_runs SET status = 'failed', finished_at = ?, errors = ? WHERE id = ?").run(nowIso(), JSON.stringify(errors), r.id);
  }
  return stale.length;
}
