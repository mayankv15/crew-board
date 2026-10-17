import type { Db } from '../db/connection.ts';
import { startSync, type SyncDeps } from '../integration/sync.ts';
import type { HrClient } from '../integration/hrClient.ts';
import { createPosition } from '../repositories/positions.ts';
import { createProject } from '../repositories/projects.ts';
import fixtureUsers from './fixture-users.json' with { type: 'json' };

const fixtureHr: HrClient = {
  fetchPage: (skip, limit) =>
    Promise.resolve({ users: fixtureUsers.slice(skip, skip + limit), total: fixtureUsers.length }),
};

type Log = SyncDeps['log'];

const DEMO = [
  {
    project: { name: 'Frankfurt DC-2 Fit-out', client: 'NorthStar Cloud', site: 'Frankfurt, Germany' },
    positions: [
      { skill: 'network-engineering', startDate: '2026-11-03', endDate: '2026-11-14', headcount: 2 },
      { skill: 'fibre-cabling', startDate: '2026-11-03', endDate: '2026-11-10', headcount: 3 },
      { skill: 'commissioning', startDate: '2026-11-16', endDate: '2026-11-27', headcount: 1 },
    ],
  },
  {
    project: { name: 'Singapore Core Network Upgrade', client: 'Meridian Telecom', site: 'Singapore' },
    positions: [
      { skill: 'network-engineering', startDate: '2026-11-09', endDate: '2026-11-20', headcount: 2 },
      { skill: 'systems-administration', startDate: '2026-11-09', endDate: '2026-11-13', headcount: 1 },
      { skill: 'project-management', startDate: '2026-11-02', endDate: '2026-11-27', headcount: 1 },
    ],
  },
  {
    project: { name: 'Dublin Hall B Expansion', client: 'Emerald Hosting', site: 'Dublin, Ireland' },
    positions: [
      { skill: 'server-installation', startDate: '2026-12-01', endDate: '2026-12-11', headcount: 4 },
      { skill: 'hardware-support', startDate: '2026-12-01', endDate: '2026-12-18', headcount: 2 },
      { skill: 'site-coordination', startDate: '2026-11-30', endDate: '2026-12-18', headcount: 1 },
    ],
  },
] as const;

export async function seedDemo(deps: {
  db: Db;
  hr: HrClient;
  log: Log;
}): Promise<{ projects: number; technicians: number; usedFixture: boolean }> {
  const { db, hr, log } = deps;
  const count = (table: string) => (db.prepare('SELECT COUNT(*) AS n FROM ' + table).get() as { n: number }).n;

  if (count('projects') === 0) {
    db.transaction(() => {
      for (const d of DEMO) {
        const project = createProject(db, d.project);
        for (const p of d.positions) createPosition(db, project.id, p);
      }
    })();
  }

  let usedFixture = false;
  if (count('technicians') === 0) {
    const run = await startSync({ db, hr, log }, 'cli').done;
    if (run.status === 'failed') {
      log.info({}, 'HR unreachable, loading the bundled fixture technicians instead');
      usedFixture = true;
      await startSync({ db, hr: fixtureHr, log }, 'cli').done;
    }
  }
  return { projects: count('projects'), technicians: count('technicians'), usedFixture };
}
