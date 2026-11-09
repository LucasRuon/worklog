CREATE TABLE sessions (
  id TEXT PRIMARY KEY, source_id TEXT NOT NULL REFERENCES sources(id), device_id TEXT NOT NULL REFERENCES devices(id),
  native_session_id TEXT NOT NULL, native_agent_id TEXT, parent_session_id TEXT, project_id TEXT REFERENCES projects(id),
  started_at TEXT NOT NULL, last_event_at TEXT NOT NULL, ended_at TEXT, state TEXT NOT NULL, complete INTEGER NOT NULL,
  event_count INTEGER NOT NULL, UNIQUE(source_id, native_session_id, native_agent_id)
) STRICT;
CREATE INDEX sessions_period ON sessions(started_at, last_event_at);
CREATE TABLE event_projects (
  event_id TEXT PRIMARY KEY REFERENCES events(event_id), project_id TEXT REFERENCES projects(id), root_id TEXT REFERENCES project_roots(id), reason TEXT NOT NULL
) STRICT;
CREATE INDEX event_projects_project ON event_projects(project_id, event_id);
CREATE TABLE session_executions (
  id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  start_at TEXT NOT NULL, end_at TEXT NOT NULL, kind TEXT NOT NULL, complete INTEGER NOT NULL
) STRICT;
