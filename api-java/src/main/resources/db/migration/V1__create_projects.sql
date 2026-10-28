CREATE TABLE projects (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL CHECK (length(name) > 0),
  client      TEXT NOT NULL CHECK (length(client) > 0),
  site        TEXT NOT NULL CHECK (length(site) > 0),
  created_at  TEXT NOT NULL
);
