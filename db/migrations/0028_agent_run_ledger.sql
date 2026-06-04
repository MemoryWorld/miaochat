CREATE TABLE IF NOT EXISTS agent_run_ledger (
  id text PRIMARY KEY,
  workspace_id text NOT NULL,
  channel_id text NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  agent_id text NOT NULL,
  provider text NOT NULL,
  turn_id text NOT NULL,
  status text NOT NULL DEFAULT 'created',
  checkpoint text NOT NULL DEFAULT 'created',
  context_snapshot_id text,
  produced_event_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  artifact_count integer NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agent_run_ledger_status_check
    CHECK (status IN (
      'created',
      'planning',
      'awaiting_approval',
      'running',
      'verifying',
      'patch_ready',
      'applied',
      'completed',
      'failed',
      'cancelled'
    ))
);

CREATE UNIQUE INDEX IF NOT EXISTS agent_run_ledger_turn_idx
  ON agent_run_ledger (workspace_id, turn_id);

CREATE INDEX IF NOT EXISTS agent_run_ledger_channel_idx
  ON agent_run_ledger (workspace_id, channel_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS agent_run_ledger_agent_idx
  ON agent_run_ledger (workspace_id, agent_id, updated_at DESC);
