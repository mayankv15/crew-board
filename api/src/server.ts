import { buildApp } from './app.ts';
import { loadConfig } from './config.ts';
import { openDatabase } from './db/connection.ts';
import { createHttpHrClient } from './integration/hrClient.ts';
import { failInterruptedRuns } from './repositories/syncRuns.ts';
import { seedDemo } from './seed/seed.ts';

const config = loadConfig();
const db = openDatabase(config.DATABASE_PATH);
const hr = createHttpHrClient({
  baseUrl: config.HR_BASE_URL,
  timeoutMs: config.HR_TIMEOUT_MS,
  maxRetries: config.HR_MAX_RETRIES,
});
const app = await buildApp({ config, db, hr });

const interrupted = failInterruptedRuns(db);
if (interrupted > 0) app.log.warn({ interrupted }, 'closed sync runs left running by a previous process');

if (process.env.SEED_ON_START === 'true') {
  const seeded = await seedDemo({ db, hr, log: app.log });
  app.log.info(seeded, 'seed checked');
}

async function shutdown(signal: string) {
  app.log.info({ signal }, 'shutting down');
  await app.close();
  db.close();
  process.exit(0);
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

await app.listen({ host: config.HOST, port: config.PORT });
