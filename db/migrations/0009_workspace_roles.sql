-- Workspace role/permission model.
--
-- The canonical permission matrix lives in code (packages/domain/src/permissions
-- /permission-catalog.ts) so updates land via deploys instead of data fixes.
-- The database is responsible for: (a) recording the role each member is
-- assigned (already in workspace_members.role) and (b) keeping a tamper-
-- evident audit trail for every role change.
CREATE TABLE IF NOT EXISTS workspace_role_audit_events (
  id text PRIMARY KEY,
  workspace_id text NOT NULL,
  workspace_owner_user_id text NOT NULL,
  actor_user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  previous_role text,
  next_role text NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (workspace_owner_user_id, workspace_id)
    REFERENCES workspaces(owner_user_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS workspace_role_audit_events_workspace_idx
  ON workspace_role_audit_events (
    workspace_owner_user_id,
    workspace_id,
    created_at DESC
  );

CREATE INDEX IF NOT EXISTS workspace_role_audit_events_target_idx
  ON workspace_role_audit_events (target_user_id, created_at DESC);
