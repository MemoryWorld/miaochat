-- Tamper-evident workspace audit log.
--
-- Every sensitive workspace event (member invite/accept, role change,
-- credential reveal, conversation share) appends one row here. The
-- `event_hash` column stores a SHA-256 over the previous hash plus the
-- canonical payload so consumers can detect retroactive edits.
CREATE TABLE IF NOT EXISTS workspace_audit_events (
  id text PRIMARY KEY,
  workspace_id text NOT NULL,
  workspace_owner_user_id text NOT NULL,
  actor_user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action text NOT NULL,
  resource_type text NOT NULL,
  resource_id text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  previous_hash text,
  event_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (workspace_owner_user_id, workspace_id)
    REFERENCES workspaces(owner_user_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS workspace_audit_events_workspace_idx
  ON workspace_audit_events (
    workspace_owner_user_id,
    workspace_id,
    created_at DESC,
    id DESC
  );

CREATE INDEX IF NOT EXISTS workspace_audit_events_action_idx
  ON workspace_audit_events (action, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS workspace_audit_events_hash_key
  ON workspace_audit_events (event_hash);
