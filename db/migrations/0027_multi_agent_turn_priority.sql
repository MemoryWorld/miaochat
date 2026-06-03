ALTER TABLE multi_agent_turns
  ADD COLUMN IF NOT EXISTS priority integer NOT NULL DEFAULT 0;
