CREATE TABLE pull_requests (
  id TEXT PRIMARY KEY,
  repository_id TEXT NOT NULL REFERENCES repositories(id),
  number INTEGER NOT NULL,
  updated_at TEXT NOT NULL,
  document TEXT NOT NULL,
  UNIQUE(repository_id, number)
);
CREATE TABLE pull_request_commits (
  pull_request_id TEXT NOT NULL REFERENCES pull_requests(id),
  sha TEXT NOT NULL,
  PRIMARY KEY(pull_request_id, sha)
);
CREATE TABLE pr_sync (
  repository_id TEXT PRIMARY KEY REFERENCES repositories(id),
  enabled INTEGER NOT NULL DEFAULT 1,
  last_sync_at TEXT,
  next_sync_ms INTEGER NOT NULL DEFAULT 0,
  retry_after_ms INTEGER NOT NULL DEFAULT 0,
  error TEXT
);
CREATE TABLE github_page_cache (
  repository_id TEXT NOT NULL REFERENCES repositories(id),
  path TEXT NOT NULL,
  etag TEXT,
  document TEXT NOT NULL,
  has_more INTEGER NOT NULL,
  PRIMARY KEY(repository_id, path)
);
