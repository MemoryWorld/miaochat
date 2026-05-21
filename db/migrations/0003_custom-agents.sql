ALTER TABLE custom_agents
  DROP CONSTRAINT IF EXISTS custom_agents_pkey;

ALTER TABLE custom_agents
  ADD CONSTRAINT custom_agents_pkey PRIMARY KEY (workspace_id, id);

CREATE UNIQUE INDEX IF NOT EXISTS custom_agents_workspace_name_key
  ON custom_agents (workspace_id, name);

CREATE INDEX IF NOT EXISTS custom_agents_workspace_created_at_idx
  ON custom_agents (workspace_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS custom_agents_workspace_provider_idx
  ON custom_agents (workspace_id, provider);
