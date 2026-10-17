import { randomUUID } from 'node:crypto';
import type { CreateProjectBody, Page, Project, ProjectQuery } from '@crew-board/shared';
import type { Db } from '../db/connection.ts';
import { likePattern, nowIso, toPage } from './util.ts';

interface ProjectRow {
  id: string;
  name: string;
  client: string;
  site: string;
  created_at: string;
  position_count: number;
}

const SELECT =
  'SELECT pr.id, pr.name, pr.client, pr.site, pr.created_at, ' +
  '(SELECT COUNT(*) FROM positions p WHERE p.project_id = pr.id) AS position_count ' +
  'FROM projects pr';

const toProject = (r: ProjectRow): Project => ({
  id: r.id,
  name: r.name,
  client: r.client,
  site: r.site,
  createdAt: r.created_at,
  positionCount: r.position_count,
});

export function listProjects(db: Db, query: ProjectQuery): Page<Project> {
  const params = { q: query.q ? likePattern(query.q) : null };
  const where = " WHERE (@q IS NULL OR pr.name LIKE @q ESCAPE '\\' OR pr.client LIKE @q ESCAPE '\\')";
  const total = (db.prepare('SELECT COUNT(*) AS n FROM projects pr' + where).get(params) as { n: number }).n;
  const rows = db
    .prepare(SELECT + where + ' ORDER BY pr.created_at DESC, pr.id LIMIT @limit OFFSET @offset')
    .all({ ...params, limit: query.pageSize, offset: (query.page - 1) * query.pageSize }) as ProjectRow[];
  return toPage(rows.map(toProject), total, query.page, query.pageSize);
}

export function getProject(db: Db, id: string): Project | undefined {
  const row = db.prepare(SELECT + ' WHERE pr.id = ?').get(id) as ProjectRow | undefined;
  return row && toProject(row);
}

export function createProject(db: Db, body: CreateProjectBody): Project {
  const id = randomUUID();
  db.prepare('INSERT INTO projects (id, name, client, site, created_at) VALUES (?, ?, ?, ?, ?)').run(
    id,
    body.name,
    body.client,
    body.site,
    nowIso(),
  );
  return getProject(db, id)!;
}
