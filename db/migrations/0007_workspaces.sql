CREATE TABLE IF NOT EXISTS workspaces (
  id text NOT NULL,
  owner_user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_user_id, id)
);

CREATE INDEX IF NOT EXISTS workspaces_owner_created_at_idx
  ON workspaces (owner_user_id, created_at ASC, id ASC);

-- Provision a default workspace for every existing user so that the workspace
-- entity is reachable end-to-end after this migration runs.
INSERT INTO workspaces (id, owner_user_id, name)
SELECT
  'default-workspace',
  users.id,
  'Default Workspace'
FROM users
ON CONFLICT (owner_user_id, id) DO NOTHING;

-- Backfill workspaces from any pre-existing workspace_id present in the
-- scope-aware tables, but only for owner_user_id values that match a real
-- user (rows with the synthetic 'system-user' placeholder are skipped).
INSERT INTO workspaces (id, owner_user_id, name)
SELECT DISTINCT
  seeded.workspace_id,
  seeded.owner_user_id,
  CASE
    WHEN seeded.workspace_id = 'default-workspace' THEN 'Default Workspace'
    ELSE seeded.workspace_id
  END
FROM (
  SELECT workspace_id, owner_user_id FROM conversations
  UNION
  SELECT workspace_id, owner_user_id FROM messages
  UNION
  SELECT workspace_id, owner_user_id FROM provider_credentials
  UNION
  SELECT workspace_id, owner_user_id FROM custom_agents
) AS seeded
INNER JOIN users ON users.id = seeded.owner_user_id
ON CONFLICT (owner_user_id, id) DO NOTHING;
