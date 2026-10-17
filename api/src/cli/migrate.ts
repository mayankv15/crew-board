import { loadConfig } from '../config.ts';
import { openDatabase } from '../db/connection.ts';

// openDatabase applies pending migrations, so opening it is the whole job.
const config = loadConfig();
const db = openDatabase(config.DATABASE_PATH);
const applied = (db.prepare('SELECT COUNT(*) AS n FROM schema_migrations').get() as { n: number }).n;
console.log(`Database ready at ${config.DATABASE_PATH} (${applied} migrations applied)`);
db.close();
