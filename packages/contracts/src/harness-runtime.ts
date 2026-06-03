import { z } from "zod";

import { conversationIdSchema, userIdSchema, workspaceIdSchema } from "./conversation.js";

export const harnessRiskLevelSchema = z.enum([
  "read_only",
  "local_write",
  "external_write",
  "privileged"
]);

export const harnessRunStatusSchema = z.enum([
  "draft",
  "queued",
  "context_building",
  "planning",
  "needs_user_input",
  "awaiting_validation",
  "awaiting_approval",
  "executing",
  "tool_failed",
  "verifying",
  "verification_failed",
  "committing",
  "recovering",
  "replaying_from_checkpoint",
  "completed",
  "cancelled",
  "rejected",
  "failed_terminal"
]);

export const harnessStepTypeSchema = z.enum([
  "context_build",
  "model_call",
  "candidate_action",
  "validation",
  "approval",
  "tool_dry_run",
  "tool_execute",
  "tool_verify",
  "state_patch",
  "memory_proposal",
  "checkpoint",
  "recovery",
  "eval",
  "final_output"
]);

export const harnessStepStatusSchema = z.enum([
  "pending",
  "running",
  "blocked",
  "completed",
  "rejected",
  "failed",
  "compensated",
  "skipped"
]);

export const statePointerScopeSchema = z.enum([
  "system",
  "workspace",
  "agent",
  "channel",
  "task",
  "run",
  "memory",
  "artifact",
  "external",
  "eval"
]);

export const statePointerSchema = z.object({
  checksum: z.string().min(1).optional(),
  id: z.string().min(1),
  scope: statePointerScopeSchema,
  version: z.number().int().nonnegative().optional()
});

export const harnessStatePatchPointerSchema = z.object({
  committed: z.boolean().default(false),
  id: z.string().min(1),
  target: statePointerSchema
});

export const harnessActorTypeSchema = z.enum([
  "runtime",
  "user",
  "agent",
  "tool",
  "system"
]);

export const harnessStateSnapshotReasonSchema = z.enum([
  "run_start",
  "step_boundary",
  "approval_boundary",
  "tool_receipt",
  "state_commit",
  "manual_correction",
  "recovery",
  "compaction"
]);

export const harnessStateSnapshotStatusSchema = z.enum([
  "active",
  "superseded",
  "quarantined"
]);

export const harnessStateSnapshotSchema = z.object({
  checkpointId: z.string().min(1).nullable().default(null),
  createdAt: z.string().datetime(),
  createdBy: z.object({
    actorId: z.string().min(1),
    actorType: harnessActorTypeSchema
  }),
  id: z.string().min(1),
  materializedRef: z.string().min(1).nullable().default(null),
  parentSnapshotId: z.string().min(1).nullable().default(null),
  reason: harnessStateSnapshotReasonSchema,
  runId: z.string().min(1).nullable().default(null),
  statePointers: z.array(statePointerSchema).default([]),
  status: harnessStateSnapshotStatusSchema,
  workspaceId: workspaceIdSchema
});

export const harnessPatchOperationSchema = z.enum([
  "append",
  "replace",
  "merge",
  "delete",
  "mark_stale",
  "quarantine",
  "link_receipt"
]);

export const harnessPatchValidationStatusSchema = z.enum([
  "pending",
  "passed",
  "failed"
]);

export const harnessStatePatchSchema = z.object({
  afterRef: z.string().min(1),
  approvalId: z.string().min(1).nullable().default(null),
  beforeRef: z.string().min(1).nullable().default(null),
  committed: z.boolean().default(false),
  committedAt: z.string().datetime().nullable().default(null),
  externalReceiptId: z.string().min(1).nullable().default(null),
  id: z.string().min(1),
  operation: harnessPatchOperationSchema,
  runId: z.string().min(1),
  schemaId: z.string().min(1),
  stepId: z.string().min(1),
  target: statePointerSchema,
  validation: z.object({
    errors: z.array(z.string().min(1)).optional(),
    status: harnessPatchValidationStatusSchema,
    validatorId: z.string().min(1)
  })
});

export const harnessPromptTrustLevelSchema = z.enum([
  "system",
  "validated",
  "user_provided",
  "tool_data",
  "model_candidate"
]);

export const harnessPromptSectionTypeSchema = z.enum([
  "system_invariant",
  "workspace_policy",
  "agent_profile",
  "runtime_plan",
  "conversation_context",
  "observation",
  "hypothesis",
  "validated_fact",
  "short_term_memory",
  "long_term_memory",
  "artifact",
  "external_receipt",
  "evaluation_state",
  "user_goal"
]);

export const harnessPromptManifestSectionSchema = z.object({
  contentRef: z.string().min(1),
  id: z.string().min(1),
  included: z.boolean().default(true),
  statePointers: z.array(statePointerSchema).default([]),
  title: z.string().min(1),
  trustLevel: harnessPromptTrustLevelSchema,
  type: harnessPromptSectionTypeSchema
});

export const harnessPromptManifestSchema = z.object({
  generatedAt: z.string().datetime(),
  id: z.string().min(1),
  runId: z.string().min(1),
  sections: z.array(harnessPromptManifestSectionSchema).default([]),
  statePointers: z.array(statePointerSchema).default([]),
  untrustedDataBoundary: z.boolean().default(true)
});

export const harnessStepSchema = z.object({
  endedAt: z.string().datetime().nullable().default(null),
  id: z.string().min(1),
  index: z.number().int().nonnegative(),
  inputRef: z.string().min(1).nullable().default(null),
  outputRef: z.string().min(1).nullable().default(null),
  reads: z.array(statePointerSchema).default([]),
  runId: z.string().min(1),
  startedAt: z.string().datetime(),
  status: harnessStepStatusSchema,
  traceEventIds: z.array(z.string().min(1)).default([]),
  type: harnessStepTypeSchema,
  writes: z.array(harnessStatePatchPointerSchema).default([])
});

export const harnessRunCountersSchema = z.object({
  approvals: z.number().int().nonnegative().default(0),
  committedPatches: z.number().int().nonnegative().default(0),
  externalReceipts: z.number().int().nonnegative().default(0),
  modelCalls: z.number().int().nonnegative().default(0),
  recoveries: z.number().int().nonnegative().default(0),
  toolCalls: z.number().int().nonnegative().default(0)
});

export const harnessRunBudgetSchema = z.object({
  deadlineAt: z.string().datetime().nullable().default(null),
  maxInputTokens: z.number().int().nonnegative().default(0),
  maxOutputTokens: z.number().int().nonnegative().default(0),
  maxToolCalls: z.number().int().nonnegative().default(0),
  maxUsd: z.number().nonnegative().default(0)
});

export const harnessRunSchema = z.object({
  agentId: z.string().min(1),
  budget: harnessRunBudgetSchema.default({}),
  channelId: z.string().min(1).nullable().default(null),
  conversationId: conversationIdSchema.nullable().default(null),
  counters: harnessRunCountersSchema.default({}),
  createdAt: z.string().datetime(),
  currentStateSnapshotId: z.string().min(1),
  endedAt: z.string().datetime().nullable().default(null),
  evalSuiteIds: z.array(z.string().min(1)).default([]),
  id: z.string().min(1),
  initiatedByUserId: userIdSchema.nullable().default(null),
  latestSafeCheckpointId: z.string().min(1).nullable().default(null),
  riskLevel: harnessRiskLevelSchema.default("read_only"),
  runtimePolicyId: z.string().min(1).nullable().default(null),
  startedAt: z.string().datetime().nullable().default(null),
  status: harnessRunStatusSchema,
  taskId: z.string().min(1).nullable().default(null),
  traceId: z.string().min(1),
  workspaceId: workspaceIdSchema
});

export const toolCallIntentStatusSchema = z.enum([
  "proposed",
  "validated",
  "rejected",
  "approved",
  "executed",
  "committed",
  "failed"
]);

export const toolCallIntentSchema = z.object({
  argsRef: z.string().min(1),
  createdAt: z.string().datetime(),
  expectedStateChange: z.string().min(1).nullable().default(null),
  id: z.string().min(1),
  naturalLanguageRationale: z.string().min(1).nullable().default(null),
  proposedByAgentId: z.string().min(1),
  runId: z.string().min(1),
  status: toolCallIntentStatusSchema,
  stepId: z.string().min(1),
  targetStatePointers: z.array(statePointerSchema).default([]),
  toolName: z.string().min(1)
});

export const externalReceiptStatusSchema = z.enum([
  "pending",
  "verified",
  "failed",
  "compensated"
]);

export const externalReceiptSchema = z.object({
  compensationRef: z.string().min(1).nullable().default(null),
  createdAt: z.string().datetime(),
  externalRef: z.string().min(1).nullable().default(null),
  id: z.string().min(1),
  idempotencyKey: z.string().min(1),
  operation: z.string().min(1),
  provider: z.string().min(1),
  receiptRef: z.string().min(1).nullable().default(null),
  runId: z.string().min(1),
  status: externalReceiptStatusSchema,
  toolExecutionId: z.string().min(1)
});

export const harnessRuntimeModeSchema = z.enum(["direct", "group", "internal"]);

export const harnessCommitPolicySchema = z.object({
  candidateIsolation: z.boolean().default(true),
  externalWritesRequireApproval: z.boolean().default(true),
  memoryWritesRequireReview: z.boolean().default(true),
  toolOutputTreatedAsData: z.boolean().default(true)
});

export const harnessRuntimeContextSchema = z.object({
  agentId: z.string().min(1),
  agentName: z.string().min(1).nullable().default(null),
  commitPolicy: harnessCommitPolicySchema.default({}),
  conversationId: conversationIdSchema.nullable().default(null),
  currentStateSnapshotId: z.string().min(1),
  latestSafeCheckpointId: z.string().min(1).nullable().default(null),
  mode: harnessRuntimeModeSchema,
  promptManifest: harnessPromptManifestSchema,
  runId: z.string().min(1),
  statePointers: z.array(statePointerSchema).default([]),
  workspaceId: workspaceIdSchema
});

export type ExternalReceipt = z.infer<typeof externalReceiptSchema>;
export type HarnessPromptManifest = z.infer<typeof harnessPromptManifestSchema>;
export type HarnessPromptManifestSection = z.infer<
  typeof harnessPromptManifestSectionSchema
>;
export type HarnessRiskLevel = z.infer<typeof harnessRiskLevelSchema>;
export type HarnessRun = z.infer<typeof harnessRunSchema>;
export type HarnessRunStatus = z.infer<typeof harnessRunStatusSchema>;
export type HarnessRuntimeContext = z.infer<typeof harnessRuntimeContextSchema>;
export type HarnessRuntimeMode = z.infer<typeof harnessRuntimeModeSchema>;
export type HarnessStatePatch = z.infer<typeof harnessStatePatchSchema>;
export type HarnessStatePatchPointer = z.infer<
  typeof harnessStatePatchPointerSchema
>;
export type HarnessStep = z.infer<typeof harnessStepSchema>;
export type StatePointer = z.infer<typeof statePointerSchema>;
export type ToolCallIntent = z.infer<typeof toolCallIntentSchema>;
