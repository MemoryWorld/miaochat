CREATE TABLE IF NOT EXISTS conversation_shares (
  conversation_id text NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  workspace_id text NOT NULL,
  workspace_owner_user_id text NOT NULL,
  shared_with_user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  permission text NOT NULL DEFAULT 'read',
  created_by_user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, shared_with_user_id),
  FOREIGN KEY (workspace_owner_user_id, workspace_id)
    REFERENCES workspaces(owner_user_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS conversation_shares_user_idx
  ON conversation_shares (shared_with_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS conversation_shares_workspace_idx
  ON conversation_shares (workspace_owner_user_id, workspace_id);
