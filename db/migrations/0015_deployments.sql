CREATE TYPE deployment_status AS ENUM ('queued', 'running', 'succeeded', 'failed');

CREATE TABLE deployments (
  id text PRIMARY KEY,
  artifact_id text NOT NULL REFERENCES artifacts(id) ON DELETE CASCADE,
  deploy_target_id text NOT NULL REFERENCES deploy_targets(id) ON DELETE CASCADE,
  owner_user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_id text NOT NULL,
  target_kind deploy_target_kind NOT NULL,
  status deployment_status NOT NULL,
  result_message text NOT NULL,
  error_message text,
  preview_url text,
  progress_events jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT deployments_workspace_fk
    FOREIGN KEY (owner_user_id, workspace_id)
    REFERENCES workspaces (owner_user_id, id)
    ON DELETE CASCADE
);

CREATE INDEX deployments_workspace_lookup_idx
  ON deployments (owner_user_id, workspace_id, created_at DESC);

CREATE INDEX deployments_artifact_lookup_idx
  ON deployments (artifact_id, created_at DESC);
