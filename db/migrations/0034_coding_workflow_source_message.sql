ALTER TABLE coding_workflows
  ADD COLUMN IF NOT EXISTS source_message_id text;
