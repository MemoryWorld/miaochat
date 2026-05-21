CREATE INDEX IF NOT EXISTS artifacts_workspace_message_created_at_idx
  ON artifacts (workspace_id, message_id, created_at ASC, id ASC);

CREATE INDEX IF NOT EXISTS artifacts_workspace_kind_created_at_idx
  ON artifacts (workspace_id, kind, created_at DESC, id DESC);
