CREATE TABLE git_commits (
  id TEXT PRIMARY KEY,
  repository_id TEXT NOT NULL REFERENCES repositories(id),
  sha TEXT NOT NULL,
  committed_at TEXT NOT NULL,
  document TEXT NOT NULL,
  UNIQUE(repository_id, sha)
) STRICT;
CREATE INDEX git_commit_date ON git_commits(committed_at, id);
CREATE TABLE git_observations (
  root_id TEXT NOT NULL REFERENCES project_roots(id),
  commit_id TEXT NOT NULL REFERENCES git_commits(id),
  reachable INTEGER NOT NULL,
  observed_at TEXT NOT NULL,
  PRIMARY KEY(root_id, commit_id)
) STRICT;
CREATE TABLE git_files (
  root_id TEXT NOT NULL REFERENCES project_roots(id),
  commit_id TEXT NOT NULL REFERENCES git_commits(id),
  position INTEGER NOT NULL,
  path TEXT NOT NULL,
  previous_path TEXT,
  status TEXT NOT NULL,
  PRIMARY KEY(root_id, commit_id, position)
) STRICT;
CREATE TABLE git_scans (
  root_id TEXT PRIMARY KEY REFERENCES project_roots(id),
  scanned_at TEXT,
  next_scan_ms INTEGER NOT NULL DEFAULT 0,
  cursor TEXT NOT NULL DEFAULT '',
  pending INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  refs TEXT NOT NULL DEFAULT '[]'
) STRICT;
CREATE TABLE git_remote_sync (
  installation_id TEXT PRIMARY KEY REFERENCES installations(id),
  snapshot TEXT NOT NULL,
  next_offset INTEGER NOT NULL,
  complete INTEGER NOT NULL,
  error TEXT
) STRICT;
