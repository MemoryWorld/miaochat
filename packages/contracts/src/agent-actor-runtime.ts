import { z } from "zod";

import { conversationIdSchema, workspaceIdSchema } from "./conversation.js";

export const agentActorSessionStatusSchema = z.enum([
  "idle",
  "waking",
  "running",
  "waiting",
  "blocked",
  "sleeping",
  "stopped"
]);

export const agentActorMailboxEventKindSchema = z.enum([
  "user_message",
  "agent_message",
  "handoff_artifact",
  "tool_receipt",
  "memory_proposal",
  "heartbeat_tick",
  "system_notice",
  "manual_wake"
]);

export const agentActorChannelEventAuthorTypeSchema = z.enum([
  "human",
  "agent",
  "system"
]);

export const agentActorChannelEventTypeSchema = z.enum([
  "user_message",
  "agent_message",
  "agent_mention",
  "tool_call",
  "tool_result",
  "approval_request",
  "reaction",
  "handoff",
  "system_event"
]);

export const agentActorChannelEventVisibilitySchema = z.enum([
  "public",
  "agent_private",
  "system_private"
]);

export const agentActorMentionTargetTypeSchema = z.enum([
  "agent",
  "role",
  "all_agents"
]);

export const agentActorBotOriginMentionPolicySchema = z.enum([
  "never",
  "same_causal_chain",
  "explicit"
]);

export const agentActorParticipantStatusSchema = z.enum([
  "available",
  "thinking",
  "waiting",
  "muted",
  "offline"
]);

export const agentActorMemoryScopeSchema = z.enum([
  "private",
  "channel",
  "workspace"
]);

export const agentActorMailboxEventStatusSchema = z.enum([
  "queued",
  "claimed",
  "processed",
  "discarded",
  "failed"
]);

export const agentActorWakeActionSchema = z.enum(["wake", "skip", "noop"]);

export const agentActorWakeReasonSchema = z.enum([
  "user_message",
  "agent_message",
  "handoff_artifact",
  "tool_receipt",
  "memory_review_due",
  "heartbeat_due",
  "system_notice",
  "manual_wake"
]);

export const agentActorTurnReasonSchema = z.enum([
  "human_mention",
  "agent_mention",
  "role_mention",
  "all_agents_mention",
  "reply_to_agent",
  "handoff",
  "manual",
  "scheduler"
]);

export const agentActorWakeSkipReasonSchema = z.enum([
  "busy",
  "sleeping",
  "stopped",
  "heartbeat_disabled",
  "not_due",
  "outside_active_hours",
  "quiet_window",
  "budget_exhausted",
  "empty_mailbox"
]);

export const agentActorTurnSkipReasonSchema = z.enum([
  "muted",
  "offline",
  "bot_origin_mentions_blocked",
  "causal_chain_budget_exhausted",
  "agent_to_agent_budget_exhausted",
  "no_human_checkpoint",
  "same_pair_ping_pong",
  "cooldown",
  "not_mentioned",
  "self_mention",
  "duplicate_candidate"
]);

export const agentActorWakeRunStatusSchema = z.enum([
  "started",
  "completed",
  "skipped",
  "failed"
]);

export const agentActorHeartbeatTargetSchema = z.enum([
  "none",
  "last_contact",
  "channel"
]);

export const agentActorActiveHoursSchema = z.object({
  end: z.string().regex(/^(?:(?:[01]\d|2[0-3]):[0-5]\d|24:00)$/),
  start: z.string().regex(/^(?:(?:[01]\d|2[0-3]):[0-5]\d|24:00)$/),
  timezone: z.string().min(1)
}).superRefine((value, context) => {
  if (value.start === "24:00") {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Active hours start must be between 00:00 and 23:59.",
      path: ["start"]
    });
  }

  if (value.start === value.end) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Active hours must not be a zero-width window.",
      path: ["end"]
    });
  }
});

export const agentActorHeartbeatPolicySchema = z.object({
  ackMaxChars: z.number().int().positive().default(300),
  activeHours: agentActorActiveHoursSchema.nullable().default(null),
  enabled: z.boolean().default(true),
  intervalMs: z.number().int().positive().default(30 * 60 * 1000),
  isolatedSession: z.boolean().default(false),
  lightContext: z.boolean().default(true),
  maxEventsPerWake: z.number().int().positive().default(8),
  maxWakeRunsPerHour: z.number().int().positive().default(6),
  quietWindowMs: z.number().int().nonnegative().default(60 * 1000),
  skipWhenBusy: z.boolean().default(true),
  target: agentActorHeartbeatTargetSchema.default("none")
});

export const agentActorTriggerPolicySchema = z.object({
  botOriginatedMentionPolicy: agentActorBotOriginMentionPolicySchema.default("never"),
  cooldownMs: z.number().int().nonnegative().default(10 * 1000),
  maxAgentToAgentTurns: z.number().int().positive().default(5),
  maxConsecutiveTurnsWithoutHuman: z.number().int().positive().default(4),
  maxSamePairPingPong: z.number().int().positive().default(3),
  maxTurnsPerCausalChain: z.number().int().positive().default(8),
  respondToAgentMentions: z.boolean().default(false),
  respondToAllAgents: z.boolean().default(false),
  respondToHumanMentions: z.boolean().default(true),
  respondToRoleMentions: z.boolean().default(true)
});

export const agentActorCheckpointPolicySchema = z.object({
  beforeExternalWrite: z.boolean().default(true),
  beforeLocalWrite: z.boolean().default(true),
  rollbackOnFailure: z.boolean().default(true)
});

export const agentActorCompressionPolicySchema = z.object({
  enabled: z.boolean().default(true),
  preserveFirstTurns: z.number().int().nonnegative().default(2),
  preserveLastTurns: z.number().int().nonnegative().default(6),
  triggerTokenRatio: z.number().gt(0).lte(1).default(0.75)
});

export const agentActorRuntimeProfileSchema = z.object({
  agentId: z.string().min(1),
  gatewayChannelIds: z.array(z.string().min(1)).default([]),
  id: z.string().min(1),
  memoryNamespace: z.string().min(1),
  sessionNamespace: z.string().min(1),
  skillNamespace: z.string().min(1),
  toolsetIds: z.array(z.string().min(1)).default([]),
  workspaceId: workspaceIdSchema
});

export const agentActorMentionSchema = z.object({
  rawText: z.string().min(1),
  targetId: z.string().min(1).nullable().default(null),
  targetType: agentActorMentionTargetTypeSchema
});

export const agentActorChannelEventSchema = z.object({
  author: z.object({
    id: z.string().min(1),
    type: agentActorChannelEventAuthorTypeSchema
  }),
  causalChainId: z.string().min(1).nullable().default(null),
  channelId: z.string().min(1),
  content: z.string().default(""),
  conversationId: conversationIdSchema.nullable().default(null),
  createdAt: z.string().datetime(),
  id: z.string().min(1),
  mentions: z.array(agentActorMentionSchema).default([]),
  metadata: z.record(z.unknown()).default({}),
  parentEventId: z.string().min(1).nullable().default(null),
  type: agentActorChannelEventTypeSchema,
  visibility: agentActorChannelEventVisibilitySchema.default("public"),
  workspaceId: workspaceIdSchema
});

export const agentActorRoleContractSchema = z.object({
  doesNotOwn: z.array(z.string().min(1)).default([]),
  mustAskBefore: z.array(z.string().min(1)).default([]),
  owns: z.array(z.string().min(1)).default([]),
  stopConditions: z.array(z.string().min(1)).default([])
});

export const agentActorParticipantSchema = z.object({
  agentId: z.string().min(1),
  behaviorRef: z.string().min(1).nullable().default(null),
  channelId: z.string().min(1),
  displayName: z.string().min(1),
  id: z.string().min(1),
  memoryScope: agentActorMemoryScopeSchema.default("private"),
  readCursorEventId: z.string().min(1).nullable().default(null),
  role: z.string().min(1),
  roleContract: agentActorRoleContractSchema.default({}),
  roleTags: z.array(z.string().min(1)).default([]),
  status: agentActorParticipantStatusSchema.default("available"),
  templateId: z.string().min(1).nullable().default(null),
  toolPolicyId: z.string().min(1).nullable().default(null),
  triggerPolicy: agentActorTriggerPolicySchema.default({}),
  workspaceId: workspaceIdSchema
});

export const agentActorSessionSchema = z.object({
  activeRunId: z.string().min(1).nullable().default(null),
  agentId: z.string().min(1),
  checkpointPolicy: agentActorCheckpointPolicySchema.default({}),
  compressionPolicy: agentActorCompressionPolicySchema.default({}),
  conversationId: conversationIdSchema.nullable().default(null),
  createdAt: z.string().datetime(),
  currentCheckpointId: z.string().min(1).nullable().default(null),
  currentStateSnapshotId: z.string().min(1).nullable().default(null),
  heartbeatPolicy: agentActorHeartbeatPolicySchema.default({}),
  id: z.string().min(1),
  lastHeartbeatAt: z.string().datetime().nullable().default(null),
  lastWakeAt: z.string().datetime().nullable().default(null),
  profileId: z.string().min(1),
  status: agentActorSessionStatusSchema.default("idle"),
  updatedAt: z.string().datetime(),
  workspaceId: workspaceIdSchema
});

export const agentActorMailboxEventSchema = z.object({
  agentId: z.string().min(1),
  availableAt: z.string().datetime(),
  conversationId: conversationIdSchema.nullable().default(null),
  createdAt: z.string().datetime(),
  dedupeKey: z.string().min(1).nullable().default(null),
  expiresAt: z.string().datetime().nullable().default(null),
  id: z.string().min(1),
  kind: agentActorMailboxEventKindSchema,
  payload: z.record(z.unknown()).default({}),
  priority: z.number().int().default(0),
  sessionId: z.string().min(1),
  sourceAgentId: z.string().min(1).nullable().default(null),
  sourceRunId: z.string().min(1).nullable().default(null),
  status: agentActorMailboxEventStatusSchema.default("queued"),
  workspaceId: workspaceIdSchema
});

export const agentActorWakeDecisionSchema = z.object({
  action: agentActorWakeActionSchema,
  reason: agentActorWakeReasonSchema.nullable().default(null),
  selectedEventIds: z.array(z.string().min(1)).default([]),
  shouldCallModel: z.boolean().default(false),
  shouldEmitMessage: z.boolean().default(false),
  skipReason: agentActorWakeSkipReasonSchema.nullable().default(null)
});

export const agentActorTurnCandidateSchema = z.object({
  agentId: z.string().min(1),
  causalChainId: z.string().min(1),
  channelId: z.string().min(1),
  priority: z.number().int(),
  reason: agentActorTurnReasonSchema,
  sourceAgentId: z.string().min(1).nullable().default(null),
  triggeringEventId: z.string().min(1),
  workspaceId: workspaceIdSchema
});

export const agentActorLoopGuardDecisionSchema = z.object({
  action: z.enum(["allow", "skip"]),
  skipReason: agentActorTurnSkipReasonSchema.nullable().default(null)
});

export const agentActorWakeRunSchema = z.object({
  agentId: z.string().min(1),
  completedAt: z.string().datetime().nullable().default(null),
  decision: agentActorWakeDecisionSchema,
  id: z.string().min(1),
  messageEmitted: z.boolean().default(false),
  modelCalled: z.boolean().default(false),
  reason: agentActorWakeReasonSchema.nullable().default(null),
  selectedEventIds: z.array(z.string().min(1)).default([]),
  sessionId: z.string().min(1),
  startedAt: z.string().datetime(),
  status: agentActorWakeRunStatusSchema,
  workspaceId: workspaceIdSchema
});

export const agentActorHeartbeatResponseSchema = z.object({
  ackMatched: z.boolean(),
  cleanedContent: z.string(),
  shouldEmitMessage: z.boolean()
});

export type AgentActorActiveHours = z.infer<
  typeof agentActorActiveHoursSchema
>;
export type AgentActorCheckpointPolicy = z.infer<
  typeof agentActorCheckpointPolicySchema
>;
export type AgentActorCompressionPolicy = z.infer<
  typeof agentActorCompressionPolicySchema
>;
export type AgentActorHeartbeatPolicy = z.infer<
  typeof agentActorHeartbeatPolicySchema
>;
export type AgentActorHeartbeatResponse = z.infer<
  typeof agentActorHeartbeatResponseSchema
>;
export type AgentActorMailboxEvent = z.infer<
  typeof agentActorMailboxEventSchema
>;
export type AgentActorMailboxEventKind = z.infer<
  typeof agentActorMailboxEventKindSchema
>;
export type AgentActorBotOriginMentionPolicy = z.infer<
  typeof agentActorBotOriginMentionPolicySchema
>;
export type AgentActorChannelEvent = z.infer<
  typeof agentActorChannelEventSchema
>;
export type AgentActorChannelEventAuthorType = z.infer<
  typeof agentActorChannelEventAuthorTypeSchema
>;
export type AgentActorLoopGuardDecision = z.infer<
  typeof agentActorLoopGuardDecisionSchema
>;
export type AgentActorMention = z.infer<typeof agentActorMentionSchema>;
export type AgentActorMemoryScope = z.infer<
  typeof agentActorMemoryScopeSchema
>;
export type AgentActorParticipant = z.infer<
  typeof agentActorParticipantSchema
>;
export type AgentActorRuntimeProfile = z.infer<
  typeof agentActorRuntimeProfileSchema
>;
export type AgentActorSession = z.infer<typeof agentActorSessionSchema>;
export type AgentActorSessionStatus = z.infer<
  typeof agentActorSessionStatusSchema
>;
export type AgentActorWakeDecision = z.infer<
  typeof agentActorWakeDecisionSchema
>;
export type AgentActorWakeReason = z.infer<
  typeof agentActorWakeReasonSchema
>;
export type AgentActorWakeRun = z.infer<typeof agentActorWakeRunSchema>;
export type AgentActorWakeSkipReason = z.infer<
  typeof agentActorWakeSkipReasonSchema
>;
export type AgentActorTriggerPolicy = z.infer<
  typeof agentActorTriggerPolicySchema
>;
export type AgentActorTurnCandidate = z.infer<
  typeof agentActorTurnCandidateSchema
>;
export type AgentActorTurnReason = z.infer<
  typeof agentActorTurnReasonSchema
>;
export type AgentActorTurnSkipReason = z.infer<
  typeof agentActorTurnSkipReasonSchema
>;
