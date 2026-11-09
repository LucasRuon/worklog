CREATE TABLE history_inputs (
  source_id TEXT PRIMARY KEY REFERENCES sources(id),
  parser TEXT NOT NULL,
  path TEXT NOT NULL
);
CREATE TABLE history_runs (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES sources(id),
  parser TEXT NOT NULL,
  from_at TEXT NOT NULL,
  to_at TEXT NOT NULL,
  checkpoint TEXT NOT NULL,
  state TEXT NOT NULL,
  imported INTEGER NOT NULL DEFAULT 0,
  skipped INTEGER NOT NULL DEFAULT 0,
  warnings TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL
);
CREATE TABLE event_provenance (
  event_id TEXT PRIMARY KEY REFERENCES events(event_id),
  parser TEXT NOT NULL,
  imported_at TEXT NOT NULL
);
