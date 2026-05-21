ALTER TABLE messages
ADD COLUMN IF NOT EXISTS mentioned_agent_ids jsonb NOT NULL DEFAULT '[]'::jsonb;
