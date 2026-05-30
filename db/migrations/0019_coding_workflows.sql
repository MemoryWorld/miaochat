DO $$
BEGIN
  CREATE TYPE runtime_backend AS ENUM (
    'enhanced-hermes',
    'claude-code-internal',
    'hermes-compat',
    'openclaw-compat',
    'mock'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE coding_workflow_state AS ENUM (
    'plan_pending_approval',
    'plan_rejected',
    'plan_revision_requested',
    'execution_running',
    'review_running',
    'qa_running',
    'awaiting_user_confirmation',
    'completed'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE coding_workflow_approval_state AS ENUM (
    'pending',
    'approved',
    'rejected',
    'revision_requested'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE coding_workflow_decision AS ENUM (
    'approved',
    'rejected',
    'revision_requested'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE coding_workflow_priority AS ENUM (
    'low',
    'normal',
    'high'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS coding_workflows (
  id text PRIMARY KEY,
  conversation_id text NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  owner_user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_id text NOT NULL,
  state coding_workflow_state NOT NULL DEFAULT 'plan_pending_approval',
  approval_state coding_workflow_approval_state NOT NULL DEFAULT 'pending',
  goal text NOT NULL,
  repo_context text,
  deadline text,
  priority coding_workflow_priority NOT NULL DEFAULT 'normal',
  runtime_backend runtime_backend NOT NULL DEFAULT 'enhanced-hermes',
  tech_lead_agent_id text NOT NULL,
  engineer_agent_id text NOT NULL,
  reviewer_agent_id text NOT NULL,
  qa_agent_id text NOT NULL,
  extra_agent_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  kickoff_message_id text,
  plan_message_id text,
  active_plan_version integer NOT NULL DEFAULT 1,
  task_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT coding_workflows_scope_key UNIQUE (owner_user_id, workspace_id, conversation_id),
  CONSTRAINT coding_workflows_workspace_fk
    FOREIGN KEY (owner_user_id, workspace_id)
    REFERENCES workspaces (owner_user_id, id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS coding_workflows_workspace_lookup_idx
  ON coding_workflows (owner_user_id, workspace_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS coding_workflows_state_lookup_idx
  ON coding_workflows (workspace_id, state, updated_at DESC);

CREATE TABLE IF NOT EXISTS coding_workflow_approvals (
  id text PRIMARY KEY,
  workflow_id text NOT NULL REFERENCES coding_workflows(id) ON DELETE CASCADE,
  owner_user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_id text NOT NULL,
  actor_user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  decision coding_workflow_decision NOT NULL,
  note text,
  plan_version integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT coding_workflow_approvals_workspace_fk
    FOREIGN KEY (owner_user_id, workspace_id)
    REFERENCES workspaces (owner_user_id, id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS coding_workflow_approvals_lookup_idx
  ON coding_workflow_approvals (workflow_id, created_at ASC);
