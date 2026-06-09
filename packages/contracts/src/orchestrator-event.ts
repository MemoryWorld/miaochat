import { z } from "zod";

import { providerIdSchema } from "./database-enums.js";
import {
  codingWorkflowApprovalStateSchema,
  codingWorkflowStateSchema,
  codingWorkflowTaskSchema
} from "./coding-workflow.js";
import { runtimeArtifactStatusSchema } from "./artifact.js";

export const orchestratorStatusLabelSchema = z.enum([
  "coding.awaiting_user_confirmation",
  "coding.completed",
  "coding.execution_failed",
  "coding.execution_started",
  "coding.plan_pending_approval",
  "coding.plan_rejected",
  "coding.plan_revision_requested",
  "coding.qa_started",
  "coding.review_started",
  "coding.summary_started",
  "orchestrator.aggregated",
  "orchestrator.dispatched",
  "orchestrator.partial_failure",
  "orchestrator.received",
  "orchestrator.running"
]);

export const orchestratorFailureCodeSchema = z.enum([
  "error",
  "timeout"
]);

export const orchestratorFailureSchema = z.object({
  agentId: z.string().min(1),
  agentName: z.string().min(1),
  code: orchestratorFailureCodeSchema,
  detail: z.string().min(1),
  provider: providerIdSchema
});

export const orchestratorStatusStateSchema = z.enum([
  "failed",
  "running",
  "succeeded"
]);

export const orchestratorStatusEventPayloadSchema = z.object({
  activeAgentName: z.string().min(1).optional(),
  approvalState: codingWorkflowApprovalStateSchema.optional(),
  artifactStatus: runtimeArtifactStatusSchema.optional(),
  failures: z.array(orchestratorFailureSchema).default([]),
  label: orchestratorStatusLabelSchema,
  state: orchestratorStatusStateSchema,
  successfulAgentCount: z.number().int().nonnegative(),
  summary: z.string().min(1).optional(),
  taskSnapshot: z.array(codingWorkflowTaskSchema).optional(),
  totalAgentCount: z.number().int().positive(),
  workflowId: z.string().min(1).optional(),
  workflowState: codingWorkflowStateSchema.optional()
});

export type OrchestratorFailure = z.infer<typeof orchestratorFailureSchema>;
export type OrchestratorFailureCode = z.infer<typeof orchestratorFailureCodeSchema>;
export type OrchestratorStatusEventPayload = z.infer<
  typeof orchestratorStatusEventPayloadSchema
>;
export type OrchestratorStatusLabel = z.infer<typeof orchestratorStatusLabelSchema>;
