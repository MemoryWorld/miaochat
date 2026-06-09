CREATE TABLE IF NOT EXISTS visual_workflows (
  id text PRIMARY KEY,
  owner_user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_id text NOT NULL,
  conversation_id text NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  source_message_id text NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text NOT NULL,
  status text NOT NULL DEFAULT 'preview',
  definition jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS visual_workflows_channel_idx
  ON visual_workflows (workspace_id, conversation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS visual_workflows_owner_idx
  ON visual_workflows (owner_user_id, workspace_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS visual_workflow_runs (
  id text PRIMARY KEY,
  workflow_id text NOT NULL REFERENCES visual_workflows(id) ON DELETE CASCADE,
  owner_user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_id text NOT NULL,
  conversation_id text NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'queued',
  node_states jsonb NOT NULL,
  output_artifact_id text REFERENCES artifacts(id) ON DELETE SET NULL,
  error text,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS visual_workflow_runs_workflow_idx
  ON visual_workflow_runs (workspace_id, workflow_id, created_at DESC);
