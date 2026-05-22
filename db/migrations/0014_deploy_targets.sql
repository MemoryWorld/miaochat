CREATE TYPE deploy_target_kind AS ENUM ('static-site', 'container', 'source-archive');

CREATE TABLE deploy_targets (
  id text PRIMARY KEY,
  workspace_id text NOT NULL,
  owner_user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL,
  kind deploy_target_kind NOT NULL,
  credential_source credential_source NOT NULL DEFAULT 'user_provided',
  encrypted_secret text,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT deploy_targets_workspace_fk
    FOREIGN KEY (owner_user_id, workspace_id)
    REFERENCES workspaces (owner_user_id, id)
    ON DELETE CASCADE,
  CONSTRAINT deploy_targets_owner_workspace_name_key
    UNIQUE (owner_user_id, workspace_id, name)
);

CREATE INDEX deploy_targets_workspace_lookup_idx
  ON deploy_targets (owner_user_id, workspace_id, created_at);
