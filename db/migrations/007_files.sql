CREATE TABLE file_contents (sha256 TEXT PRIMARY KEY, content TEXT NOT NULL, stored_at TEXT NOT NULL) STRICT;
CREATE TABLE file_revisions (
  id TEXT PRIMARY KEY, root_id TEXT NOT NULL REFERENCES project_roots(id), file_id TEXT NOT NULL,
  path TEXT NOT NULL, occurred_at TEXT NOT NULL, sha256 TEXT, document TEXT NOT NULL
) STRICT;
CREATE INDEX file_revisions_period ON file_revisions(occurred_at, id);
CREATE INDEX file_revisions_history ON file_revisions(root_id, file_id);
CREATE TABLE tracked_files (
  root_id TEXT NOT NULL REFERENCES project_roots(id), path TEXT NOT NULL, file_id TEXT NOT NULL,
  revision_id TEXT NOT NULL REFERENCES file_revisions(id), identity TEXT, fingerprint TEXT NOT NULL,
  PRIMARY KEY(root_id, path)
) STRICT;
CREATE TABLE file_access (
  root_id TEXT NOT NULL REFERENCES project_roots(id), path TEXT NOT NULL, allowed INTEGER NOT NULL,
  PRIMARY KEY(root_id, path)
) STRICT;
CREATE TABLE file_journal (
  seq INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, root_id TEXT NOT NULL REFERENCES project_roots(id),
  target TEXT NOT NULL
) STRICT;
CREATE TABLE file_scans (
  root_id TEXT PRIMARY KEY REFERENCES project_roots(id), scanned_at TEXT, monitoring_since TEXT,
  error TEXT, last_gap_at TEXT, pending INTEGER NOT NULL DEFAULT 0, baselined INTEGER NOT NULL DEFAULT 0,
  owner TEXT, lease_ms INTEGER NOT NULL DEFAULT 0
) STRICT;
CREATE TABLE file_remote_sync (
  installation_id TEXT PRIMARY KEY REFERENCES installations(id), seq INTEGER NOT NULL, error TEXT
) STRICT;
