-- Tempo lançado manualmente: soma à dedicação automática, sem substituí-la. Append-only; remoção por registro compensatório.
CREATE TABLE manual_time (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  local_date TEXT NOT NULL,
  day_start_at TEXT NOT NULL,
  duration_ms INTEGER NOT NULL CHECK(duration_ms > 0 AND duration_ms <= 86400000),
  note TEXT NOT NULL,
  device_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  removes TEXT UNIQUE REFERENCES manual_time(id)
);
CREATE INDEX manual_time_day ON manual_time(day_start_at);
CREATE TRIGGER manual_time_no_update BEFORE UPDATE ON manual_time BEGIN SELECT RAISE(ABORT, 'immutable manual time'); END;
CREATE TRIGGER manual_time_no_delete BEFORE DELETE ON manual_time BEGIN SELECT RAISE(ABORT, 'immutable manual time'); END;
