CREATE TABLE root_controls(root_id TEXT PRIMARY KEY REFERENCES project_roots(id), enabled INTEGER NOT NULL CHECK(enabled IN (0,1)));
INSERT INTO settings VALUES ('configRevision', '0');
INSERT INTO settings VALUES ('operatingConfig', '{"idleMs":300000,"retentionDays":30,"syncIntervalMs":15000,"storageBudgetBytes":1073741824,"excludedPaths":[]}');
