ALTER TABLE visual_workflow_runs
  ADD COLUMN IF NOT EXISTS input_values jsonb NOT NULL DEFAULT '{}'::jsonb;
