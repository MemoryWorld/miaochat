ALTER TYPE coding_workflow_state
  ADD VALUE IF NOT EXISTS 'execution_failed' AFTER 'execution_running';
