CREATE TABLE IF NOT EXISTS teammate_channel_memberships (
  id text PRIMARY KEY,
  owner_user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_id text NOT NULL,
  channel_id text NOT NULL,
  teammate_id text NOT NULL,
  teammate_kind text NOT NULL DEFAULT 'custom_agent',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS workspace_tasks (
  id text PRIMARY KEY,
  owner_user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_id text NOT NULL,
  title text NOT NULL,
  summary text,
  state text NOT NULL DEFAULT 'todo',
  priority text NOT NULL DEFAULT 'normal',
  owner_scope text NOT NULL,
  owner_scope_id text,
  teammate_id text,
  channel_id text,
  workflow_id text REFERENCES coding_workflows(id) ON DELETE SET NULL,
  due_at timestamptz,
  source_kind text NOT NULL DEFAULT 'manual',
  source_ref_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS calendar_events (
  id text PRIMARY KEY,
  owner_user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_id text NOT NULL,
  title text NOT NULL,
  summary text,
  owner_scope text NOT NULL,
  owner_scope_id text,
  teammate_id text,
  channel_id text,
  workflow_id text REFERENCES coding_workflows(id) ON DELETE SET NULL,
  start_at timestamptz NOT NULL,
  end_at timestamptz,
  status text NOT NULL DEFAULT 'scheduled',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS approval_requests (
  id text PRIMARY KEY,
  owner_user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_id text NOT NULL,
  conversation_id text REFERENCES conversations(id) ON DELETE CASCADE,
  workflow_id text REFERENCES coding_workflows(id) ON DELETE CASCADE,
  requester_teammate_id text,
  requester_teammate_name text,
  kind text NOT NULL,
  title text NOT NULL,
  summary text NOT NULL,
  status text NOT NULL,
  note text,
  plan_version integer,
  target_user_id text,
  response_note text,
  responded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS activity_rounds (
  id text PRIMARY KEY,
  owner_user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_id text NOT NULL,
  conversation_id text REFERENCES conversations(id) ON DELETE CASCADE,
  workflow_id text REFERENCES coding_workflows(id) ON DELETE CASCADE,
  channel_id text,
  acting_teammate_id text,
  acting_teammate_name text,
  phase text NOT NULL,
  status text NOT NULL,
  summary text NOT NULL,
  tool_activity_preview text,
  output_preview text,
  approval_request_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS activity_round_steps (
  id text PRIMARY KEY,
  round_id text NOT NULL REFERENCES activity_rounds(id) ON DELETE CASCADE,
  label text NOT NULL,
  status text NOT NULL,
  summary text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS memory_records (
  id text PRIMARY KEY,
  owner_user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_id text NOT NULL,
  teammate_id text,
  conversation_id text REFERENCES conversations(id) ON DELETE CASCADE,
  scope text NOT NULL,
  title text NOT NULL,
  content text NOT NULL,
  source text NOT NULL DEFAULT 'manual',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS workspace_skill_bindings (
  id text PRIMARY KEY,
  owner_user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_id text NOT NULL,
  skill_id text NOT NULL,
  teammate_id text,
  enabled boolean NOT NULL DEFAULT true,
  source text NOT NULL DEFAULT 'workspace',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
