ALTER TYPE provider_id ADD VALUE IF NOT EXISTS 'deepseek';

ALTER TABLE custom_agents
  ADD COLUMN IF NOT EXISTS model_profile_id text,
  ADD COLUMN IF NOT EXISTS memory_mode text NOT NULL DEFAULT 'workspace_plus_teammate',
  ADD COLUMN IF NOT EXISTS approval_mode text NOT NULL DEFAULT 'balanced',
  ADD COLUMN IF NOT EXISTS output_style text NOT NULL DEFAULT '清晰、结构化、先给结论再给步骤。',
  ADD COLUMN IF NOT EXISTS scope_description text;
