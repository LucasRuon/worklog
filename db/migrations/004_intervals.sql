CREATE TABLE intervals (
  id TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK(kind IN ('human', 'agent')), session_id TEXT NOT NULL,
  project_id TEXT REFERENCES projects(id), device_id TEXT NOT NULL REFERENCES devices(id), tool TEXT NOT NULL,
  start_at TEXT NOT NULL, end_at TEXT NOT NULL, quality TEXT NOT NULL CHECK(quality IN ('estimated', 'observed', 'adjusted')),
  CHECK(end_at >= start_at)
) STRICT;
CREATE INDEX intervals_period ON intervals(kind, start_at, end_at);
INSERT INTO settings VALUES ('humanWindowMs', '300000');
