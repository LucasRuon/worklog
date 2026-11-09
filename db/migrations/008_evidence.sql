CREATE TABLE evidence_links (
  source_id TEXT NOT NULL REFERENCES file_revisions(id), target_id TEXT NOT NULL,
  kind TEXT NOT NULL, confidence TEXT NOT NULL, reason TEXT NOT NULL, created_at TEXT NOT NULL,
  PRIMARY KEY(source_id, target_id)
) STRICT;
CREATE INDEX evidence_links_target ON evidence_links(target_id, source_id);
