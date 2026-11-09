CREATE TABLE devices (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, os TEXT NOT NULL, timezone TEXT NOT NULL
) STRICT;
CREATE TABLE installations (
  id TEXT PRIMARY KEY, device_id TEXT NOT NULL REFERENCES devices(id), last_seq INTEGER NOT NULL DEFAULT 0 CHECK(last_seq >= 0)
) STRICT;
CREATE TABLE sources (
  id TEXT PRIMARY KEY, installation_id TEXT NOT NULL REFERENCES installations(id), device_id TEXT NOT NULL REFERENCES devices(id),
  tool TEXT NOT NULL, profile TEXT NOT NULL, config_path TEXT NOT NULL, version TEXT NOT NULL, enabled INTEGER NOT NULL CHECK(enabled IN (0,1)),
  UNIQUE(installation_id, tool, config_path)
) STRICT;
CREATE TABLE events (
  event_id TEXT PRIMARY KEY, installation_id TEXT NOT NULL REFERENCES installations(id), origin_seq INTEGER NOT NULL CHECK(origin_seq > 0),
  source_id TEXT NOT NULL REFERENCES sources(id), device_id TEXT NOT NULL REFERENCES devices(id), type TEXT NOT NULL,
  occurred_at TEXT NOT NULL, received_at TEXT NOT NULL, document TEXT NOT NULL CHECK(json_valid(document)),
  UNIQUE(installation_id, origin_seq)
) STRICT;
CREATE INDEX events_time ON events(occurred_at, event_id);
CREATE INDEX events_source ON events(source_id, origin_seq);
CREATE TABLE sync_cursors (
  installation_id TEXT PRIMARY KEY REFERENCES installations(id), seq INTEGER NOT NULL CHECK(seq >= 0)
) STRICT;
CREATE TRIGGER events_no_update BEFORE UPDATE ON events BEGIN SELECT RAISE(ABORT, 'immutable event'); END;
CREATE TRIGGER events_no_delete BEFORE DELETE ON events BEGIN SELECT RAISE(ABORT, 'immutable event'); END;
