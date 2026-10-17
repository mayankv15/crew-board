import { loadConfig } from '../config.ts';
import { openDatabase } from '../db/connection.ts';
import { createHttpHrClient } from '../integration/hrClient.ts';
import { startSync } from '../integration/sync.ts';
import { failInterruptedRuns } from '../repositories/syncRuns.ts';

const config = loadConfig();
const db = openDatabase(config.DATABASE_PATH);
failInterruptedRuns(db);
const hr = createHttpHrClient({
  baseUrl: config.HR_BASE_URL,
  timeoutMs: config.HR_TIMEOUT_MS,
  maxRetries: config.HR_MAX_RETRIES,
});
const log = { info: (_o: object, m: string) => console.log(m), error: (o: object, m: string) => console.error(m, o) };

try {
  const run = await startSync({ db, hr, log }, 'cli').done;
  console.log(
    `Sync ${run.status}: ${run.created} created, ${run.updated} updated, ${run.unchanged} unchanged, ` +
      `${run.deactivated} deactivated, ${run.failed} failed (${run.pagesDone}/${run.pagesTotal ?? '?'} pages)`,
  );
  for (const e of run.errors) console.error(`  ${e.scope}: ${e.message}`);
  db.close();
  process.exit(run.status === 'succeeded' ? 0 : run.status === 'partial' ? 2 : 1);
} catch (e) {
  console.error((e as Error).message);
  db.close();
  process.exit(1);
}
