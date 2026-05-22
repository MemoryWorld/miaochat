CREATE TABLE IF NOT EXISTS workspace_members (
  workspace_id text NOT NULL,
  workspace_owner_user_id text NOT NULL,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member',
  joined_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_owner_user_id, workspace_id, user_id),
  FOREIGN KEY (workspace_owner_user_id, workspace_id)
    REFERENCES workspaces(owner_user_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS workspace_members_user_id_idx
  ON workspace_members (user_id);

CREATE INDEX IF NOT EXISTS workspace_members_workspace_idx
  ON workspace_members (workspace_owner_user_id, workspace_id, joined_at ASC);

CREATE TABLE IF NOT EXISTS workspace_invitations (
  id text PRIMARY KEY,
  workspace_id text NOT NULL,
  workspace_owner_user_id text NOT NULL,
  invited_email text NOT NULL,
  invited_by_user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member',
  token_hash text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  accepted_user_id text REFERENCES users(id) ON DELETE SET NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (workspace_owner_user_id, workspace_id)
    REFERENCES workspaces(owner_user_id, id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS workspace_invitations_token_hash_key
  ON workspace_invitations (token_hash);

CREATE INDEX IF NOT EXISTS workspace_invitations_workspace_status_idx
  ON workspace_invitations (workspace_owner_user_id, workspace_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS workspace_invitations_invited_email_idx
  ON workspace_invitations (invited_email, status);

-- Backfill: every workspace owner is an implicit member of their own workspace.
INSERT INTO workspace_members (
  workspace_id,
  workspace_owner_user_id,
  user_id,
  role
)
SELECT
  workspaces.id,
  workspaces.owner_user_id,
  workspaces.owner_user_id,
  'owner'
FROM workspaces
ON CONFLICT (workspace_owner_user_id, workspace_id, user_id) DO NOTHING;
