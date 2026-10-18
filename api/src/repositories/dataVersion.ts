import type { Db } from '../db/connection.ts';

/** Moves whenever a row the board shows is written. See the triggers in db/migrations.ts. */
export function getDataVersion(db: Db): number {
  return (db.prepare('SELECT version FROM data_version WHERE id = 1').get() as { version: number }).version;
}
