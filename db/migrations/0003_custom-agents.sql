ALTER TABLE custom_agents
  DROP CONSTRAINT IF EXISTS custom_agents_pkey;

ALTER TABLE custom_agents
  ADD CONSTRAINT custom_agents_pkey PRIMARY KEY (workspace_id, id);

WITH duplicate_agent_names AS (
  SELECT
    ctid,
    id,
    name,
    row_number() OVER (
      PARTITION BY workspace_id, name
      ORDER BY created_at ASC, id ASC
    ) AS duplicate_rank
  FROM custom_agents
),
renamed_duplicate_agent_names AS (
  SELECT
    ctid,
    name || ' (' || duplicate_rank::text || '-' || right(md5(id), 8) || ')' AS next_name
  FROM duplicate_agent_names
  WHERE duplicate_rank > 1
)
UPDATE custom_agents
SET
  name = renamed_duplicate_agent_names.next_name,
  updated_at = now()
FROM renamed_duplicate_agent_names
WHERE custom_agents.ctid = renamed_duplicate_agent_names.ctid;

CREATE UNIQUE INDEX IF NOT EXISTS custom_agents_workspace_name_key
  ON custom_agents (workspace_id, name);

CREATE INDEX IF NOT EXISTS custom_agents_workspace_created_at_idx
  ON custom_agents (workspace_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS custom_agents_workspace_provider_idx
  ON custom_agents (workspace_id, provider);
