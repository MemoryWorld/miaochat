CREATE TABLE IF NOT EXISTS multi_agent_participants (
  id text PRIMARY KEY,
  workspace_id text NOT NULL,
  channel_id text NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  agent_id text NOT NULL,
  display_name text NOT NULL,
  role_key text NOT NULL,
  role_label text NOT NULL,
  status text NOT NULL DEFAULT 'available',
  role_contract jsonb NOT NULL DEFAULT '{}'::jsonb,
  trigger_policy jsonb NOT NULL DEFAULT '{}'::jsonb,
  memory_policy jsonb NOT NULL DEFAULT '{}'::jsonb,
  read_cursor jsonb NOT NULL DEFAULT '{}'::jsonb,
  role_tags jsonb NOT NULL DEFAULT '[]'::jsonb,
  tool_policy_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT multi_agent_participants_status_check
    CHECK (status IN ('available', 'queued', 'thinking', 'waiting_approval', 'muted', 'offline', 'error'))
);

CREATE UNIQUE INDEX IF NOT EXISTS multi_agent_participants_channel_agent_idx
  ON multi_agent_participants (workspace_id, channel_id, agent_id);

CREATE INDEX IF NOT EXISTS multi_agent_participants_channel_status_idx
  ON multi_agent_participants (workspace_id, channel_id, status);

CREATE TABLE IF NOT EXISTS multi_agent_channel_events (
  id text PRIMARY KEY,
  workspace_id text NOT NULL,
  channel_id text NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  owner_user_id text NOT NULL,
  message_id text REFERENCES messages(id) ON DELETE CASCADE,
  causal_chain_id text,
  parent_event_id text,
  author_type text NOT NULL,
  author_id text NOT NULL,
  event_type text NOT NULL,
  content text NOT NULL DEFAULT '',
  structured_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  mentions jsonb NOT NULL DEFAULT '[]'::jsonb,
  visibility text NOT NULL DEFAULT 'public',
  provenance jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT multi_agent_channel_events_author_type_check
    CHECK (author_type IN ('human', 'agent', 'system', 'tool')),
  CONSTRAINT multi_agent_channel_events_visibility_check
    CHECK (visibility IN ('public', 'agent_private', 'system_private')),
  CONSTRAINT multi_agent_channel_events_type_check
    CHECK (event_type IN (
      'user_message',
      'agent_message',
      'agent_turn_started',
      'agent_turn_completed',
      'agent_turn_failed',
      'handoff_requested',
      'handoff_accepted',
      'handoff_rejected',
      'handoff_completed',
      'critique_request',
      'tool_plan_proposed',
      'tool_call_started',
      'tool_call_completed',
      'tool_call_failed',
      'approval_requested',
      'approval_granted',
      'approval_denied',
      'memory_candidate_created',
      'memory_committed',
      'memory_quarantined',
      'loop_guard_triggered',
      'system_event'
    ))
);

CREATE UNIQUE INDEX IF NOT EXISTS multi_agent_channel_events_message_idx
  ON multi_agent_channel_events (workspace_id, message_id)
  WHERE message_id IS NOT NULL
    AND event_type IN ('user_message', 'agent_message', 'system_event');

CREATE INDEX IF NOT EXISTS multi_agent_channel_events_channel_created_idx
  ON multi_agent_channel_events (workspace_id, channel_id, created_at, id);

CREATE INDEX IF NOT EXISTS multi_agent_channel_events_chain_idx
  ON multi_agent_channel_events (workspace_id, causal_chain_id, created_at)
  WHERE causal_chain_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS multi_agent_causal_chains (
  id text PRIMARY KEY,
  workspace_id text NOT NULL,
  channel_id text NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  root_event_id text NOT NULL,
  last_event_id text,
  status text NOT NULL DEFAULT 'open',
  summary text,
  turn_count integer NOT NULL DEFAULT 0,
  agent_to_agent_turn_count integer NOT NULL DEFAULT 0,
  max_turns integer NOT NULL DEFAULT 8,
  max_agent_to_agent_turns integer NOT NULL DEFAULT 5,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT multi_agent_causal_chains_status_check
    CHECK (status IN ('open', 'paused', 'completed', 'stopped_by_guard', 'failed'))
);

CREATE INDEX IF NOT EXISTS multi_agent_causal_chains_channel_idx
  ON multi_agent_causal_chains (workspace_id, channel_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS multi_agent_context_snapshots (
  id text PRIMARY KEY,
  workspace_id text NOT NULL,
  channel_id text NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  causal_chain_id text NOT NULL,
  agent_turn_id text NOT NULL,
  agent_participant_id text NOT NULL,
  rendered_prompt_hash text NOT NULL,
  rendered_prompt_preview text NOT NULL DEFAULT '',
  source_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  token_estimate jsonb NOT NULL DEFAULT '{"total":0,"bySourceType":{}}'::jsonb,
  redactions jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS multi_agent_context_snapshots_turn_idx
  ON multi_agent_context_snapshots (workspace_id, agent_turn_id);

CREATE TABLE IF NOT EXISTS multi_agent_turns (
  id text PRIMARY KEY,
  workspace_id text NOT NULL,
  channel_id text NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  agent_participant_id text NOT NULL,
  agent_id text NOT NULL,
  source_agent_participant_id text,
  triggering_event_id text NOT NULL,
  causal_chain_id text NOT NULL,
  priority integer NOT NULL DEFAULT 0,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'queued',
  context_snapshot_id text,
  budget jsonb NOT NULL DEFAULT '{}'::jsonb,
  runtime_policy_id text,
  idempotency_key text NOT NULL,
  queued_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  error_code text,
  error_message text,
  produced_event_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  CONSTRAINT multi_agent_turns_reason_check
    CHECK (reason IN (
      'human_mention',
      'human_role_mention',
      'human_all_agents',
      'agent_handoff',
      'agent_mention_allowed',
      'reply_to_agent',
      'manual_retry',
      'scheduled_followup'
    )),
  CONSTRAINT multi_agent_turns_status_check
    CHECK (status IN (
      'queued',
      'context_building',
      'running',
      'waiting_approval',
      'completed',
      'skipped',
      'failed',
      'cancelled',
      'blocked_by_loop_guard'
    ))
);

CREATE UNIQUE INDEX IF NOT EXISTS multi_agent_turns_idempotency_idx
  ON multi_agent_turns (workspace_id, idempotency_key);

CREATE INDEX IF NOT EXISTS multi_agent_turns_channel_idx
  ON multi_agent_turns (workspace_id, channel_id, queued_at, id);

CREATE TABLE IF NOT EXISTS multi_agent_handoffs (
  id text PRIMARY KEY,
  workspace_id text NOT NULL,
  channel_id text NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  causal_chain_id text NOT NULL,
  source_agent_participant_id text NOT NULL,
  target_agent_participant_id text,
  target_role_key text,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'requested',
  created_event_id text NOT NULL,
  accepted_event_id text,
  completed_event_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT multi_agent_handoffs_status_check
    CHECK (status IN ('requested', 'accepted', 'rejected', 'completed', 'expired', 'cancelled'))
);

CREATE INDEX IF NOT EXISTS multi_agent_handoffs_channel_idx
  ON multi_agent_handoffs (workspace_id, channel_id, created_at, id);

CREATE INDEX IF NOT EXISTS multi_agent_handoffs_chain_idx
  ON multi_agent_handoffs (workspace_id, causal_chain_id, created_at);
