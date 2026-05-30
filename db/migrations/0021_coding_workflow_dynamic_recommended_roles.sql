ALTER TABLE coding_workflows
  ADD COLUMN IF NOT EXISTS planning_teammate_id text,
  ADD COLUMN IF NOT EXISTS planning_role text,
  ADD COLUMN IF NOT EXISTS execution_stage_assignments jsonb NOT NULL DEFAULT '[]'::jsonb;

UPDATE coding_workflows
SET
  planning_teammate_id = COALESCE(planning_teammate_id, tech_lead_agent_id),
  planning_role = COALESCE(planning_role, 'tech_lead'),
  execution_stage_assignments = CASE
    WHEN execution_stage_assignments = '[]'::jsonb THEN jsonb_build_array(
      jsonb_build_object('agentId', engineer_agent_id, 'role', 'software_engineer'),
      jsonb_build_object('agentId', reviewer_agent_id, 'role', 'code_reviewer'),
      jsonb_build_object('agentId', qa_agent_id, 'role', 'qa_tester')
    )
    ELSE execution_stage_assignments
  END;

ALTER TABLE coding_workflows
  ALTER COLUMN planning_teammate_id SET NOT NULL,
  ALTER COLUMN planning_role SET NOT NULL;
