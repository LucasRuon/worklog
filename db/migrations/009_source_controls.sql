CREATE TABLE source_controls (
  source_id TEXT PRIMARY KEY REFERENCES sources(id),
  enabled INTEGER NOT NULL CHECK(enabled IN (0,1)),
  removed_at TEXT,
  revision INTEGER NOT NULL DEFAULT 1 CHECK(revision >= 1)
);
ALTER TABLE intervals ADD COLUMN source_id TEXT REFERENCES sources(id);
INSERT INTO settings VALUES ('intervalProjection', '-1') ON CONFLICT(key) DO UPDATE SET value = '-1';
