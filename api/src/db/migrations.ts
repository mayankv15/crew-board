// Tables whose rows the board shows. Any write to one of them moves data_version, so the web app can ask
// "has anything changed?" with one cheap read. Triggers cover every write path, including ones added later.
const TRACKED_TABLES = ['assignments', 'positions', 'projects', 'technicians', 'technician_skills'];
const VERSION_TRIGGERS = TRACKED_TABLES.flatMap((table) =>
  (['INSERT', 'UPDATE', 'DELETE'] as const).map(
    (op) =>
      `CREATE TRIGGER ${table}_${op.toLowerCase()}_bumps_version AFTER ${op} ON ${table} ` +
      'BEGIN UPDATE data_version SET version = version + 1 WHERE id = 1; END;',
  ),
).join('\n');

export const MIGRATIONS: { id: number; name: string; sql: string }[] = [
  {
    id: 1,
    name: 'init',
    sql: `
CREATE TABLE projects (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL CHECK (length(name) > 0),
  client      TEXT NOT NULL CHECK (length(client) > 0),
  site        TEXT NOT NULL CHECK (length(site) > 0),
  created_at  TEXT NOT NULL
);

CREATE TABLE positions (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL REFERENCES projects (id),
  skill       TEXT NOT NULL,
  start_date  TEXT NOT NULL,
  end_date    TEXT NOT NULL,
  headcount   INTEGER NOT NULL CHECK (headcount >= 1),
  created_at  TEXT NOT NULL,
  CHECK (end_date >= start_date)
);

CREATE TABLE technicians (
  id              TEXT PRIMARY KEY,
  external_id     INTEGER NOT NULL UNIQUE,
  name            TEXT NOT NULL,
  title           TEXT NOT NULL,
  department      TEXT NOT NULL,
  city            TEXT NOT NULL,
  state           TEXT NOT NULL,
  country         TEXT NOT NULL,
  active          INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  deactivated_at  TEXT,
  deactivated_by  TEXT CHECK (deactivated_by IN ('sync', 'webhook')),
  hr_updated_at   TEXT NOT NULL,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);

CREATE TABLE technician_skills (
  technician_id  TEXT NOT NULL REFERENCES technicians (id) ON DELETE CASCADE,
  skill          TEXT NOT NULL,
  PRIMARY KEY (technician_id, skill)
);

CREATE TABLE assignments (
  id             TEXT PRIMARY KEY,
  position_id    TEXT NOT NULL REFERENCES positions (id),
  technician_id  TEXT NOT NULL REFERENCES technicians (id),
  start_date     TEXT NOT NULL,
  end_date       TEXT NOT NULL,
  created_at     TEXT NOT NULL,
  UNIQUE (position_id, technician_id),
  CHECK (end_date >= start_date)
);

CREATE TABLE sync_runs (
  id           TEXT PRIMARY KEY,
  trigger      TEXT NOT NULL CHECK (trigger IN ('api', 'cli')),
  status       TEXT NOT NULL CHECK (status IN ('running', 'succeeded', 'partial', 'failed')),
  started_at   TEXT NOT NULL,
  finished_at  TEXT,
  pages_done   INTEGER NOT NULL DEFAULT 0,
  pages_total  INTEGER,
  created      INTEGER NOT NULL DEFAULT 0,
  updated      INTEGER NOT NULL DEFAULT 0,
  unchanged    INTEGER NOT NULL DEFAULT 0,
  deactivated  INTEGER NOT NULL DEFAULT 0,
  failed       INTEGER NOT NULL DEFAULT 0,
  errors       TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE webhook_events (
  event_id     TEXT PRIMARY KEY,
  type         TEXT NOT NULL,
  received_at  TEXT NOT NULL,
  outcome      TEXT NOT NULL
);

CREATE INDEX idx_assignments_technician_dates ON assignments (technician_id, start_date, end_date);
CREATE INDEX idx_assignments_position ON assignments (position_id);
CREATE INDEX idx_positions_project ON positions (project_id);
CREATE INDEX idx_positions_skill_start ON positions (skill, start_date);
CREATE INDEX idx_technician_skills_skill ON technician_skills (skill);
CREATE INDEX idx_sync_runs_started ON sync_runs (started_at);
`,
  },
  {
    id: 2,
    name: 'data_version',
    sql: `
CREATE TABLE data_version (
  id       INTEGER PRIMARY KEY CHECK (id = 1),
  version  INTEGER NOT NULL
);

INSERT INTO data_version (id, version) VALUES (1, 0);

${VERSION_TRIGGERS}
`,
  },
];
