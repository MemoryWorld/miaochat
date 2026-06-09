ALTER TYPE coding_workflow_state
  ADD VALUE IF NOT EXISTS 'summary_running' AFTER 'qa_running';
