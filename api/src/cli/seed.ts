import { loadConfig } from '../config.ts';
import { openDatabase } from '../db/connection.ts';
import { createHttpHrClient } from '../integration/hrClient.ts';
import { seedDemo } from '../seed/seed.ts';

const config = loadConfig();
const db = openDatabase(config.DATABASE_PATH);
const hr = createHttpHrClient({ baseUrl: config.HR_BASE_URL, timeoutMs: config.HR_TIMEOUT_MS, maxRetries: config.HR_MAX_RETRIES });
const log = { info: (_o: object, m: string) => console.log(m), error: (o: object, m: string) => console.error(m, o) };

const result = await seedDemo({ db, hr, log });
console.log(`Seeded: ${result.projects} projects, ${result.technicians} technicians${result.usedFixture ? ' (from bundled fixture)' : ''}`);
db.close();
