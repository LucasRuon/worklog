CREATE TABLE time_adjustments (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  start_at TEXT NOT NULL,
  end_at TEXT NOT NULL,
  document TEXT NOT NULL,
  undo_of TEXT UNIQUE REFERENCES time_adjustments(id),
  created_at TEXT NOT NULL,
  CHECK(end_at > start_at)
);
CREATE TRIGGER adjustments_no_update BEFORE UPDATE ON time_adjustments BEGIN SELECT RAISE(ABORT, 'immutable adjustment'); END;
CREATE TRIGGER adjustments_no_delete BEFORE DELETE ON time_adjustments BEGIN SELECT RAISE(ABORT, 'immutable adjustment'); END;
CREATE TABLE note_versions (
  id TEXT PRIMARY KEY,
  target_id TEXT NOT NULL,
  project_id TEXT NOT NULL REFERENCES projects(id),
  revision INTEGER NOT NULL,
  occurred_at TEXT NOT NULL,
  document TEXT NOT NULL,
  UNIQUE(target_id, revision)
);
CREATE TRIGGER notes_no_update BEFORE UPDATE ON note_versions BEGIN SELECT RAISE(ABORT, 'immutable note'); END;
CREATE TRIGGER notes_no_delete BEFORE DELETE ON note_versions BEGIN SELECT RAISE(ABORT, 'immutable note'); END;
INSERT INTO settings VALUES ('adjustmentRevision', '0');
INSERT INTO settings VALUES ('reportSafetyRevision', '0');
