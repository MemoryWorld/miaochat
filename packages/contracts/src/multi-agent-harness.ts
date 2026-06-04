import { z } from "zod";

import { workspaceIdSchema } from "./conversation.js";

export const multiAgentChannelEventTypeSchema = z.enum([
  "user_message",
  "agent_message",
  "agent_turn_started",
  "agent_turn_completed",
  "agent_turn_failed",
  "handoff_requested",
  "handoff_accepted",
  "handoff_rejected",
  "handoff_completed",
  "critique_request",
  "tool_plan_proposed",
  "tool_call_started",
  "tool_call_completed",
  "tool_call_failed",
  "approval_requested",
  "approval_granted",
  "approval_denied",
  "memory_candidate_created",
  "memory_committed",
  "memory_quarantined",
  "loop_guard_triggered",
  "system_event"
]);

export const multiAgentEventAuthorTypeSchema = z.enum([
  "human",
  "agent",
  "system",
  "tool"
]);

export const multiAgentEventVisibilitySchema = z.enum([
  "public",
  "agent_private",
  "system_private"
]);

export const multiAgentMentionKindSchema = z.enum([
  "agent",
  "role",
  "all_agents",
  "reply_target"
]);

export const multiAgentEventProvenanceSchema = z.object({
  confidence: z.number().min(0).max(1).nullable().default(null),
  modelId: z.string().min(1).optional(),
  sourceId: z.string().min(1).nullable().default(null),
  sourceType: z.enum([
    "human_input",
    "agent_model_output",
    "tool_result",
    "retrieved_document",
    "memory",
    "system_policy"
  ]),
  toolName: z.string().min(1).optional(),
  trustScore: z.number().min(0).max(1).nullable().default(null),
  verificationRefs: z.array(z.string().min(1)).default([]),
  verified: z.boolean().default(false)
});

export const multiAgentResolvedMentionSchema = z.object({
  confidence: z.number().min(0).max(1),
  kind: multiAgentMentionKindSchema,
  raw: z.string().min(1),
  requiresHumanConfirmation: z.boolean().default(false),
  targetParticipantIds: z.array(z.string().min(1)).default([])
});

export const multiAgentChannelEventSchema = z.object({
  authorId: z.string().min(1),
  authorType: multiAgentEventAuthorTypeSchema,
  causalChainId: z.string().min(1).nullable().default(null),
  channelId: z.string().min(1),
  content: z.string().default(""),
  createdAt: z.string().datetime(),
  id: z.string().min(1),
  mentions: z.array(multiAgentResolvedMentionSchema).default([]),
  parentEventId: z.string().min(1).nullable().default(null),
  provenance: multiAgentEventProvenanceSchema,
  structuredPayload: z.record(z.unknown()).default({}),
  type: multiAgentChannelEventTypeSchema,
  visibility: multiAgentEventVisibilitySchema.default("public"),
  workspaceId: workspaceIdSchema
});

export const multiAgentRoleContractSchema = z.object({
  defaultHandoffTargets: z.array(
    z.object({
      condition: z.string().min(1),
      targetRoleKey: z.string().min(1)
    })
  ).default([]),
  doesNotOwn: z.array(z.string().min(1)).default([]),
  mustAskBefore: z.array(z.string().min(1)).default([]),
  mustNotDo: z.array(z.string().min(1)).default([]),
  owns: z.array(z.string().min(1)).default([]),
  responseStyle: z.object({
    avoidSpeculationWithoutLabel: z.boolean().default(true),
    maxBullets: z.number().int().positive().optional(),
    requireActionableNextStep: z.boolean().default(true)
  }).default({}),
  stopConditions: z.array(z.string().min(1)).default([])
});

export const multiAgentTriggerPolicySchema = z.object({
  allowBotOriginatedMentions: z.enum([
    "never",
    "handoff_only",
    "same_causal_chain",
    "explicit"
  ]).default("handoff_only"),
  cooldownSeconds: z.number().int().nonnegative().default(15),
  maxAgentToAgentTurns: z.number().int().positive().default(5),
  maxConsecutiveTurnsWithoutHuman: z.number().int().positive().default(4),
  maxSamePairPingPong: z.number().int().positive().default(3),
  maxTurnsPerCausalChain: z.number().int().positive().default(3),
  maxTurnsPerHour: z.number().int().positive().default(30),
  respondToAgentMentions: z.boolean().default(false),
  respondToAllAgents: z.boolean().default(false),
  respondToHumanMentions: z.boolean().default(true),
  respondToReplyToSelf: z.boolean().default(true),
  respondToRoleMentions: z.boolean().default(true)
});

export const multiAgentMemoryPolicySchema = z.object({
  canReadChannelMemory: z.boolean().default(true),
  canReadOwnPrivateMemory: z.boolean().default(true),
  canReadProceduralMemory: z.boolean().default(true),
  canWriteCandidateMemory: z.boolean().default(true)
});

export const multiAgentReadCursorSchema = z.object({
  beliefSnapshotId: z.string().min(1).nullable().default(null),
  lastSeenAt: z.string().datetime().nullable().default(null),
  lastSeenEventId: z.string().min(1).nullable().default(null)
});

export const multiAgentParticipantStatusSchema = z.enum([
  "available",
  "queued",
  "thinking",
  "waiting_approval",
  "muted",
  "offline",
  "error"
]);

export const multiAgentParticipantSchema = z.object({
  agentId: z.string().min(1),
  aliases: z.array(z.string().min(1)).default([]),
  channelId: z.string().min(1),
  createdAt: z.string().datetime().default("1970-01-01T00:00:00.000Z"),
  displayName: z.string().min(1),
  id: z.string().min(1),
  memoryPolicy: multiAgentMemoryPolicySchema.default({}),
  readCursor: multiAgentReadCursorSchema.default({}),
  roleContract: multiAgentRoleContractSchema.default({}),
  roleKey: z.string().min(1),
  roleLabel: z.string().min(1),
  roleTags: z.array(z.string().min(1)).default([]),
  status: multiAgentParticipantStatusSchema.default("available"),
  toolPolicyId: z.string().min(1).nullable().default(null),
  triggerPolicy: multiAgentTriggerPolicySchema.default({}),
  updatedAt: z.string().datetime().default("1970-01-01T00:00:00.000Z"),
  workspaceId: workspaceIdSchema
});

export const multiAgentTurnReasonSchema = z.enum([
  "human_mention",
  "human_role_mention",
  "human_all_agents",
  "agent_handoff",
  "agent_mention_allowed",
  "reply_to_agent",
  "manual_retry",
  "scheduled_followup"
]);

export const multiAgentTurnStatusSchema = z.enum([
  "queued",
  "context_building",
  "running",
  "waiting_approval",
  "completed",
  "skipped",
  "failed",
  "cancelled",
  "blocked_by_loop_guard"
]);

export const multiAgentTurnBudgetSchema = z.object({
  maxCostUsd: z.number().nonnegative().nullable().default(null),
  maxInputTokens: z.number().int().nonnegative().default(0),
  maxOutputTokens: z.number().int().nonnegative().default(0),
  maxToolCalls: z.number().int().nonnegative().default(0),
  maxWallTimeMs: z.number().int().nonnegative().default(0)
});

export const multiAgentTurnCandidateSchema = z.object({
  agentId: z.string().min(1),
  agentParticipantId: z.string().min(1),
  causalChainId: z.string().min(1),
  channelId: z.string().min(1),
  priority: z.number().int(),
  reason: multiAgentTurnReasonSchema,
  sourceAgentParticipantId: z.string().min(1).nullable().default(null),
  triggeringEventId: z.string().min(1),
  workspaceId: workspaceIdSchema
});

export const multiAgentTurnSchema = multiAgentTurnCandidateSchema.extend({
  budget: multiAgentTurnBudgetSchema.default({}),
  completedAt: z.string().datetime().nullable().default(null),
  contextSnapshotId: z.string().min(1).nullable().default(null),
  errorCode: z.string().min(1).nullable().default(null),
  errorMessage: z.string().min(1).nullable().default(null),
  id: z.string().min(1),
  idempotencyKey: z.string().min(1),
  producedEventIds: z.array(z.string().min(1)).default([]),
  queuedAt: z.string().datetime(),
  runtimePolicyId: z.string().min(1).nullable().default(null),
  startedAt: z.string().datetime().nullable().default(null),
  status: multiAgentTurnStatusSchema.default("queued")
});

export const multiAgentRunStatusSchema = z.enum([
  "created",
  "planning",
  "awaiting_approval",
  "running",
  "verifying",
  "patch_ready",
  "applied",
  "completed",
  "failed",
  "cancelled"
]);

export const multiAgentRunLedgerSchema = z.object({
  agentId: z.string().min(1),
  artifactCount: z.number().int().nonnegative().default(0),
  channelId: z.string().min(1),
  checkpoint: z.string().min(1),
  contextSnapshotId: z.string().min(1).nullable().default(null),
  createdAt: z.string().datetime(),
  id: z.string().min(1),
  metadata: z.record(z.unknown()).default({}),
  producedEventIds: z.array(z.string().min(1)).default([]),
  provider: z.string().min(1),
  status: multiAgentRunStatusSchema,
  turnId: z.string().min(1),
  updatedAt: z.string().datetime(),
  workspaceId: workspaceIdSchema
});

export const multiAgentCausalChainSchema = z.object({
  agentToAgentTurnCount: z.number().int().nonnegative().default(0),
  channelId: z.string().min(1),
  createdAt: z.string().datetime(),
  id: z.string().min(1),
  lastEventId: z.string().min(1).nullable().default(null),
  maxAgentToAgentTurns: z.number().int().positive().default(5),
  maxTurns: z.number().int().positive().default(8),
  rootEventId: z.string().min(1),
  status: z.enum(["open", "paused", "completed", "stopped_by_guard", "failed"]),
  summary: z.string().min(1).nullable().default(null),
  turnCount: z.number().int().nonnegative().default(0),
  updatedAt: z.string().datetime(),
  workspaceId: workspaceIdSchema
});

export const multiAgentHandoffPayloadSchema = z.object({
  acceptanceCriteria: z.array(z.string().min(1)).min(1),
  constraints: z.array(z.string().min(1)).default([]),
  contextEventIds: z.array(z.string().min(1)).default([]),
  deadline: z.string().datetime().optional(),
  expectedArtifact: z.string().min(1).optional(),
  goal: z.string().min(1)
});

export const multiAgentHandoffStatusSchema = z.enum([
  "requested",
  "accepted",
  "rejected",
  "completed",
  "expired",
  "cancelled"
]);

export const multiAgentHandoffSchema = z.object({
  acceptedEventId: z.string().min(1).nullable().default(null),
  causalChainId: z.string().min(1),
  channelId: z.string().min(1),
  completedEventId: z.string().min(1).nullable().default(null),
  createdAt: z.string().datetime(),
  createdEventId: z.string().min(1),
  id: z.string().min(1),
  payload: multiAgentHandoffPayloadSchema,
  sourceAgentParticipantId: z.string().min(1),
  status: multiAgentHandoffStatusSchema.default("requested"),
  targetAgentParticipantId: z.string().min(1).nullable().default(null),
  targetRoleKey: z.string().min(1).nullable().default(null),
  updatedAt: z.string().datetime(),
  workspaceId: workspaceIdSchema
});

export const multiAgentContextSourceTypeSchema = z.enum([
  "system_policy",
  "workspace_fact",
  "role_contract",
  "triggering_event",
  "handoff_payload",
  "causal_chain_summary",
  "recent_channel_history",
  "private_memory",
  "procedural_memory",
  "tool_policy"
]);

export const multiAgentContextSourceRefSchema = z.object({
  included: z.boolean(),
  reason: z.string().min(1),
  refId: z.string().min(1),
  tokenEstimate: z.number().int().nonnegative().default(0),
  type: multiAgentContextSourceTypeSchema
});

export const multiAgentContextSnapshotSchema = z.object({
  agentParticipantId: z.string().min(1),
  agentTurnId: z.string().min(1),
  causalChainId: z.string().min(1),
  channelId: z.string().min(1),
  createdAt: z.string().datetime(),
  id: z.string().min(1),
  redactions: z.array(
    z.object({
      reason: z.string().min(1),
      sourceRefId: z.string().min(1)
    })
  ).default([]),
  renderedPromptHash: z.string().min(1),
  renderedPromptPreview: z.string(),
  sourceRefs: z.array(multiAgentContextSourceRefSchema).default([]),
  tokenEstimate: z.object({
    bySourceType: z.record(z.number().int().nonnegative()).default({}),
    total: z.number().int().nonnegative().default(0)
  }),
  workspaceId: workspaceIdSchema
});

export const multiAgentToolRiskSchema = z.enum([
  "low",
  "medium",
  "high",
  "forbidden"
]);

export const multiAgentProposedToolCallSchema = z.object({
  idempotencyKey: z.string().min(1),
  input: z.record(z.unknown()).default({}),
  inputSchemaVersion: z.string().min(1),
  toolName: z.string().min(1)
});

export const multiAgentToolPlanSchema = z.object({
  calls: z.array(multiAgentProposedToolCallSchema).default([]),
  expectedSideEffects: z.array(z.string().min(1)).default([]),
  id: z.string().min(1),
  proposedByAgentId: z.string().min(1),
  riskLevel: multiAgentToolRiskSchema,
  rollbackPlan: z.string().min(1).nullable().default(null),
  status: z.enum(["proposed", "approved", "denied", "executed", "failed"]).default("proposed"),
  summary: z.string().min(1)
});

export const multiAgentHandoffOutputIntentSchema = z.object({
  acceptanceCriteria: z.array(z.string().min(1)).min(1),
  constraints: z.array(z.string().min(1)).default([]),
  contextEventIds: z.array(z.string().min(1)).default([]),
  expectedArtifact: z.string().min(1).optional(),
  goal: z.string().min(1),
  targetAgentId: z.string().min(1).optional(),
  targetParticipantId: z.string().min(1).optional(),
  targetRoleKey: z.string().min(1).optional(),
  type: z.literal("handoff_request")
}).refine(
  (intent) => Boolean(intent.targetAgentId ?? intent.targetParticipantId ?? intent.targetRoleKey),
  {
    message: "handoff_request requires targetAgentId, targetParticipantId, or targetRoleKey"
  }
);

export const multiAgentToolPlanOutputIntentSchema = z.object({
  calls: z.array(multiAgentProposedToolCallSchema).default([]),
  expectedSideEffects: z.array(z.string().min(1)).default([]),
  riskLevel: z.enum(["low", "medium", "high"]),
  rollbackPlan: z.string().min(1).nullable().default(null),
  summary: z.string().min(1),
  type: z.literal("tool_plan")
});

export const multiAgentMemoryCandidateOutputIntentSchema = z.object({
  memoryType: z.enum(["private", "workspace", "procedural"]),
  ownerRoleKey: z.string().min(1).optional(),
  summary: z.string().min(1),
  title: z.string().min(1).optional(),
  type: z.literal("memory_candidate")
});

export const multiAgentNoActionOutputIntentSchema = z.object({
  reason: z.string().min(1),
  type: z.literal("no_action")
});

export const multiAgentOutputIntentSchema = z.union([
  multiAgentHandoffOutputIntentSchema,
  multiAgentToolPlanOutputIntentSchema,
  multiAgentMemoryCandidateOutputIntentSchema,
  multiAgentNoActionOutputIntentSchema
]);

export const multiAgentOutputEnvelopeSchema = z.object({
  intents: z.array(multiAgentOutputIntentSchema).default([]),
  visibleMessage: z.string().default("")
});

export const multiAgentPermissionPolicySchema = z.object({
  allowedToolRisk: z.enum(["none", "low", "medium", "high_with_approval"]).default("low"),
  canCreateToolPlan: z.boolean().default(false),
  canInitiateHandoff: z.boolean().default(false),
  canMentionAgents: z.boolean().default(false),
  canMentionAllAgents: z.boolean().default(false),
  canMentionRoles: z.boolean().default(false),
  canReadChannel: z.boolean().default(true),
  canWriteChannel: z.boolean().default(true),
  memoryReadScopes: z.array(z.enum([
    "own_private",
    "channel",
    "workspace",
    "procedural"
  ])).default([]),
  memoryWriteScopes: z.array(z.enum([
    "candidate_private",
    "candidate_workspace",
    "procedural_candidate"
  ])).default([]),
  participantId: z.string().min(1)
});

export const multiAgentPlanVerificationResultSchema = z.object({
  detectedRisks: z.array(z.enum([
    "intent_mismatch",
    "metadata_poisoning",
    "excessive_scope",
    "missing_rollback",
    "secret_exposure",
    "unverified_target",
    "forbidden_tool",
    "policy_exceeds_allowed_risk"
  ])).default([]),
  reasons: z.array(z.string().min(1)).default([]),
  verdict: z.enum(["allow", "deny", "needs_human_approval"])
});

export const multiAgentProceduralMemoryStepSchema = z.object({
  description: z.string().min(1),
  expectedOutputs: z.array(z.string().min(1)).default([]),
  id: z.string().min(1),
  ownerRoleKey: z.string().min(1).optional(),
  requiredInputs: z.array(z.string().min(1)).default([]),
  title: z.string().min(1),
  verification: z.array(z.string().min(1)).default([])
});

export const multiAgentProceduralMemorySchema = z.object({
  antiPatterns: z.array(z.string().min(1)).default([]),
  createdAt: z.string().datetime(),
  failureCount: z.number().int().nonnegative().default(0),
  id: z.string().min(1),
  lastUsedAt: z.string().datetime().nullable().default(null),
  ownerRoleKey: z.string().min(1).nullable().default(null),
  scope: z.enum(["workspace", "channel", "agent_role", "agent"]).default("agent_role"),
  sourceCausalChainId: z.string().min(1),
  status: z.enum(["candidate", "approved", "rejected", "deprecated"]),
  steps: z.array(multiAgentProceduralMemoryStepSchema).default([]),
  successCount: z.number().int().nonnegative().default(0),
  summary: z.string().min(1),
  title: z.string().min(1),
  updatedAt: z.string().datetime(),
  workspaceId: workspaceIdSchema
});

export const multiAgentTrajectoryMetricsSchema = z.object({
  agentToAgentTurnCount: z.number().int().nonnegative(),
  contextTokenTotal: z.number().int().nonnegative().default(0),
  duplicateOutputRate: z.number().min(0).max(1).default(0),
  estimatedCostUsd: z.number().nonnegative().default(0),
  failedToolCallCount: z.number().int().nonnegative().default(0),
  finalOutcome: z.enum(["success", "partial", "failed", "cancelled"]),
  handoffCount: z.number().int().nonnegative(),
  handoffSuccessRate: z.number().min(0).max(1),
  humanInterventionCount: z.number().int().nonnegative(),
  loopGuardTriggered: z.boolean(),
  staleResponseCount: z.number().int().nonnegative().default(0),
  toolPlanApprovalRate: z.number().min(0).max(1).default(0),
  turnCount: z.number().int().nonnegative()
});

export type MultiAgentChannelEvent = z.infer<typeof multiAgentChannelEventSchema>;
export type MultiAgentChannelEventType = z.infer<typeof multiAgentChannelEventTypeSchema>;
export type MultiAgentContextSnapshot = z.infer<typeof multiAgentContextSnapshotSchema>;
export type MultiAgentContextSourceRef = z.infer<typeof multiAgentContextSourceRefSchema>;
export type MultiAgentCausalChain = z.infer<typeof multiAgentCausalChainSchema>;
export type MultiAgentHandoff = z.infer<typeof multiAgentHandoffSchema>;
export type MultiAgentHandoffStatus = z.infer<typeof multiAgentHandoffStatusSchema>;
export type MultiAgentOutputEnvelope = z.infer<typeof multiAgentOutputEnvelopeSchema>;
export type MultiAgentOutputIntent = z.infer<typeof multiAgentOutputIntentSchema>;
export type MultiAgentParticipant = z.infer<typeof multiAgentParticipantSchema>;
export type MultiAgentPermissionPolicy = z.infer<typeof multiAgentPermissionPolicySchema>;
export type MultiAgentPlanVerificationResult = z.infer<
  typeof multiAgentPlanVerificationResultSchema
>;
export type MultiAgentProceduralMemory = z.infer<typeof multiAgentProceduralMemorySchema>;
export type MultiAgentProceduralMemoryStep = z.infer<
  typeof multiAgentProceduralMemoryStepSchema
>;
export type MultiAgentResolvedMention = z.infer<typeof multiAgentResolvedMentionSchema>;
export type MultiAgentRunLedger = z.infer<typeof multiAgentRunLedgerSchema>;
export type MultiAgentRunStatus = z.infer<typeof multiAgentRunStatusSchema>;
export type MultiAgentToolPlan = z.infer<typeof multiAgentToolPlanSchema>;
export type MultiAgentTrajectoryMetrics = z.infer<typeof multiAgentTrajectoryMetricsSchema>;
export type MultiAgentTriggerPolicy = z.infer<typeof multiAgentTriggerPolicySchema>;
export type MultiAgentTurn = z.infer<typeof multiAgentTurnSchema>;
export type MultiAgentTurnCandidate = z.infer<typeof multiAgentTurnCandidateSchema>;
export type MultiAgentTurnReason = z.infer<typeof multiAgentTurnReasonSchema>;
