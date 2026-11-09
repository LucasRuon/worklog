CREATE TABLE work_summaries (
  id TEXT PRIMARY KEY,
  filter_json TEXT NOT NULL,
  text TEXT NOT NULL,
  evidence_ids TEXT NOT NULL,
  rule_version TEXT NOT NULL,
  created_at TEXT NOT NULL
);
