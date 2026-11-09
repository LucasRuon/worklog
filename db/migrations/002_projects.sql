CREATE TABLE projects (id TEXT PRIMARY KEY, name TEXT NOT NULL, client TEXT) STRICT;
CREATE TABLE repositories (id TEXT PRIMARY KEY, canonical TEXT NOT NULL UNIQUE, primary_project_id TEXT REFERENCES projects(id)) STRICT;
CREATE TABLE project_roots (
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), repository_id TEXT REFERENCES repositories(id),
  device_id TEXT NOT NULL REFERENCES devices(id), path TEXT NOT NULL, worktree TEXT NOT NULL,
  enabled INTEGER NOT NULL CHECK(enabled IN (0,1)), UNIQUE(device_id, path)
) STRICT;
