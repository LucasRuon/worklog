CREATE TABLE remote_hosts (
  host TEXT PRIMARY KEY, node_path TEXT NOT NULL, app_path TEXT NOT NULL, data_dir TEXT NOT NULL,
  device_id TEXT, installation_id TEXT, last_sync_at TEXT, next_sync_ms INTEGER NOT NULL DEFAULT 0,
  failures INTEGER NOT NULL DEFAULT 0, last_error TEXT, clock_skew_ms INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1))
) STRICT;
CREATE TABLE event_quality (
  event_id TEXT PRIMARY KEY REFERENCES events(event_id), reason TEXT NOT NULL CHECK(reason = 'clock-skew')
) STRICT;
