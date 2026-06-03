import { createHash } from "node:crypto";

import type {
  MultiAgentCausalChain,
  MultiAgentChannelEvent,
  MultiAgentContextSnapshot,
  MultiAgentContextSourceRef,
  MultiAgentHandoff,
  MultiAgentOutputEnvelope,
  MultiAgentParticipant,
  MultiAgentPermissionPolicy,
  MultiAgentPlanVerificationResult,
  MultiAgentProceduralMemory,
  MultiAgentProceduralMemoryStep,
  MultiAgentResolvedMention,
  MultiAgentToolPlan,
  MultiAgentTrajectoryMetrics,
  MultiAgentTurnCandidate,
  MultiAgentTurnReason
} from "@agenthub/contracts";
import {
  multiAgentChannelEventSchema,
  multiAgentContextSnapshotSchema,
  multiAgentOutputEnvelopeSchema,
  multiAgentPlanVerificationResultSchema,
  multiAgentProceduralMemorySchema,
  multiAgentTrajectoryMetricsSchema
} from "@agenthub/contracts";

export type ResolveMultiAgentMentionsInput = {
  allAgentsConfirmationThreshold?: number;
  content: string;
  participants: MultiAgentParticipant[];
  replyToParticipantId?: string | null;
};

export type SelectMultiAgentTurnCandidatesInput = {
  allAgentsConfirmed?: boolean;
  event: MultiAgentChannelEvent;
  mentions: MultiAgentResolvedMention[];
  participants: MultiAgentParticipant[];
};

export type MultiAgentLoopGuard =
  | "chain_paused"
  | "max_turns_per_chain"
  | "max_agent_to_agent_turns"
  | "max_consecutive_without_human"
  | "same_pair_ping_pong"
  | "cooldown"
  | "muted_agent"
  | "offline_agent"
  | "budget_exceeded";

export type MultiAgentLoopGuardDecision =
  | {
      action: "allow";
      guard: null;
      suggestedActions: [];
    }
  | {
      action: "block";
      guard: MultiAgentLoopGuard;
      suggestedActions: string[];
    };

export type ApplyMultiAgentLoopGuardInput = {
  candidate: MultiAgentTurnCandidate;
  causalChain: MultiAgentCausalChain;
  events: MultiAgentChannelEvent[];
  now?: string;
  participant: MultiAgentParticipant;
  recentTurnStartedAt?: string | null;
};

export type AssembleMultiAgentContextInput = {
  budget?: {
    maxSourceRefs?: number;
    maxTotalChars?: number;
  };
  causalChain: MultiAgentCausalChain;
  events: MultiAgentChannelEvent[];
  participant: MultiAgentParticipant;
  privateMemory?: Array<{
    id: string;
    ownerParticipantId: string;
    status: "candidate" | "approved" | "quarantined" | "rejected";
    summary: string;
  }>;
  proceduralMemories?: Array<{
    id: string;
    ownerRoleKey: string | null;
    status: "candidate" | "approved" | "rejected" | "deprecated";
    summary: string;
  }>;
  triggeringEvent: MultiAgentChannelEvent;
  turn: MultiAgentTurnCandidate;
};

export type MultiAgentBuiltContext = {
  renderedPromptPreview: string;
  snapshot: MultiAgentContextSnapshot;
};

export type CreateProceduralMemoryCandidateInput = {
  antiPatterns?: string[];
  causalChainId: string;
  id: string;
  now: string;
  ownerRoleKey?: string | null;
  steps: MultiAgentProceduralMemoryStep[];
  summary: string;
  title: string;
  workspaceId: string;
};

export type VerifyToolPlanInput = {
  plan: Pick<
    MultiAgentToolPlan,
    "calls" | "expectedSideEffects" | "id" | "proposedByAgentId" | "riskLevel" | "rollbackPlan" | "summary"
  >;
  policy: MultiAgentPermissionPolicy;
};

export type ParseMultiAgentOutputEnvelopeInput = {
  rawText: string;
};

export type ParseMultiAgentOutputEnvelopeResult = {
  envelope: MultiAgentOutputEnvelope;
  errors: string[];
  extractedJson: boolean;
};

export function resolveMultiAgentMentions(
  input: ResolveMultiAgentMentionsInput
): MultiAgentResolvedMention[] {
  const mentions: MultiAgentResolvedMention[] = [];
  const allAgentsConfirmationThreshold = input.allAgentsConfirmationThreshold ?? 3;
  const mentionPattern = /(^|[\s,，。.!?；;:：])@([^\s@,，。.!?；;:：]+)/g;

  for (const match of input.content.matchAll(mentionPattern)) {
    const token = match[2];

    if (!token) {
      continue;
    }

    const raw = `@${token}`;
    const normalized = normalizeMention(token);

    if (normalized === "all-agents" || normalized === "all_agents") {
      const targets = input.participants
        .filter(isActiveParticipant)
        .map((participant) => participant.id);

      mentions.push({
        confidence: 1,
        kind: "all_agents",
        raw,
        requiresHumanConfirmation: targets.length > allAgentsConfirmationThreshold,
        targetParticipantIds: targets
      });
      continue;
    }

    const agentTargets = input.participants
      .filter((participant) => participantMatchesAgentMention(participant, token, normalized))
      .map((participant) => participant.id);

    if (agentTargets.length > 0) {
      mentions.push({
        confidence: 1,
        kind: "agent",
        raw,
        requiresHumanConfirmation: false,
        targetParticipantIds: agentTargets
      });
      continue;
    }

    const roleTargets = input.participants
      .filter((participant) => participantMatchesRoleMention(participant, normalized))
      .map((participant) => participant.id);

    mentions.push({
      confidence: roleTargets.length > 0 ? 1 : 0,
      kind: "role",
      raw,
      requiresHumanConfirmation: false,
      targetParticipantIds: roleTargets
    });
  }

  if (input.replyToParticipantId) {
    mentions.push({
      confidence: 1,
      kind: "reply_target",
      raw: "reply",
      requiresHumanConfirmation: false,
      targetParticipantIds: [input.replyToParticipantId]
    });
  }

  return mentions;
}

export function selectMultiAgentTurnCandidates(
  input: SelectMultiAgentTurnCandidatesInput
): MultiAgentTurnCandidate[] {
  if (input.event.visibility !== "public") {
    return [];
  }

  const candidates =
    input.event.type === "handoff_requested"
      ? selectHandoffCandidates(input)
      : input.event.authorType === "human"
        ? selectHumanEventCandidates(input)
        : input.event.authorType === "agent"
          ? selectAgentEventCandidates(input)
          : [];
  const byParticipant = new Map<string, MultiAgentTurnCandidate>();

  for (const candidate of candidates) {
    const existing = byParticipant.get(candidate.agentParticipantId);

    if (!existing || candidate.priority > existing.priority) {
      byParticipant.set(candidate.agentParticipantId, candidate);
    }
  }

  return [...byParticipant.values()].sort((left, right) => {
    if (left.priority !== right.priority) {
      return right.priority - left.priority;
    }

    return left.agentParticipantId.localeCompare(right.agentParticipantId);
  });
}

export function createAgentTurnIdempotencyKey(
  candidate: MultiAgentTurnCandidate
): string {
  return createHash("sha256")
    .update(
      [
        candidate.channelId,
        candidate.triggeringEventId,
        candidate.agentParticipantId,
        candidate.reason,
        candidate.causalChainId
      ].join(":")
    )
    .digest("hex");
}

export function parseMultiAgentOutputEnvelope(
  input: ParseMultiAgentOutputEnvelopeInput
): ParseMultiAgentOutputEnvelopeResult {
  const candidates = extractJsonCandidates(input.rawText);
  const errors: string[] = [];

  for (const candidate of candidates) {
    const jsonResult = parseJsonObject(candidate);

    if (!jsonResult.ok) {
      errors.push(jsonResult.error);
      continue;
    }

    const envelopeResult = multiAgentOutputEnvelopeSchema.safeParse(jsonResult.value);

    if (!envelopeResult.success) {
      errors.push(envelopeResult.error.issues.map((issue) => issue.message).join("; "));
      continue;
    }

    return {
      envelope: envelopeResult.data,
      errors: [],
      extractedJson: candidate !== input.rawText.trim()
    };
  }

  return {
    envelope: multiAgentOutputEnvelopeSchema.parse({
      intents: [],
      visibleMessage: input.rawText
    }),
    errors: errors.length > 0
      ? errors
      : ["No parseable multi-agent output envelope found."],
    extractedJson: false
  };
}

export function applyMultiAgentLoopGuard(
  input: ApplyMultiAgentLoopGuardInput
): MultiAgentLoopGuardDecision {
  if (input.causalChain.status === "paused") {
    return block("chain_paused", ["resume_chain", "summarize", "stop_chain"]);
  }

  if (input.participant.status === "muted") {
    return block("muted_agent", ["unmute_agent", "skip_turn"]);
  }

  if (input.participant.status === "offline") {
    return block("offline_agent", ["wake_agent", "skip_turn"]);
  }

  if (input.causalChain.turnCount >= input.causalChain.maxTurns) {
    return block("max_turns_per_chain", ["summarize", "continue_once", "stop_chain"]);
  }

  if (
    input.candidate.sourceAgentParticipantId &&
    input.causalChain.agentToAgentTurnCount >= input.causalChain.maxAgentToAgentTurns
  ) {
    return block("max_agent_to_agent_turns", [
      "summarize",
      "continue_once",
      "pause_chain"
    ]);
  }

  if (
    input.candidate.sourceAgentParticipantId &&
    countConsecutiveAgentEventsSinceHuman(input.events) >=
      input.participant.triggerPolicy.maxConsecutiveTurnsWithoutHuman
  ) {
    return block("max_consecutive_without_human", [
      "summarize",
      "continue_once",
      "ask_human"
    ]);
  }

  if (
    input.candidate.sourceAgentParticipantId &&
    countRecentSamePairAgentEvents({
      events: input.events,
      sourceAgentId: input.candidate.sourceAgentParticipantId,
      targetAgentId: input.candidate.agentId
    }) >= input.participant.triggerPolicy.maxSamePairPingPong
  ) {
    return block("same_pair_ping_pong", [
      "summarize",
      "continue_once",
      "pause_agent"
    ]);
  }

  if (input.now && input.recentTurnStartedAt) {
    const elapsedSeconds =
      (Date.parse(input.now) - Date.parse(input.recentTurnStartedAt)) / 1000;

    if (elapsedSeconds < input.participant.triggerPolicy.cooldownSeconds) {
      return block("cooldown", ["wait", "continue_once"]);
    }
  }

  return {
    action: "allow",
    guard: null,
    suggestedActions: []
  };
}

export function createLoopGuardChannelEvent(input: {
  blockedParticipantIds: string[];
  causalChainId: string;
  channelId: string;
  guard: MultiAgentLoopGuard;
  id: string;
  now: string;
  parentEventId: string | null;
  suggestedActions: string[];
  workspaceId: string;
}): MultiAgentChannelEvent {
  return multiAgentChannelEventSchema.parse({
    authorId: "multi-agent-scheduler",
    authorType: "system",
    causalChainId: input.causalChainId,
    channelId: input.channelId,
    content: `已暂停连续 AI 同事响应，因为达到 ${input.guard} 限制。`,
    createdAt: input.now,
    id: input.id,
    parentEventId: input.parentEventId,
    provenance: {
      confidence: 1,
      sourceId: null,
      sourceType: "system_policy",
      trustScore: 1,
      verified: true
    },
    structuredPayload: {
      blockedParticipantIds: input.blockedParticipantIds,
      guard: input.guard,
      suggestedActions: input.suggestedActions
    },
    type: "loop_guard_triggered",
    workspaceId: input.workspaceId
  });
}

export function transitionHandoff(input: {
  eventId?: string;
  handoff: MultiAgentHandoff;
  now: string;
  transition: "accept" | "reject" | "complete" | "expire" | "cancel";
}): MultiAgentHandoff {
  const { handoff } = input;

  if (input.transition === "accept" && handoff.status === "requested") {
    return {
      ...handoff,
      acceptedEventId: input.eventId ?? handoff.acceptedEventId,
      status: "accepted",
      updatedAt: input.now
    };
  }

  if (input.transition === "complete" && handoff.status === "accepted") {
    return {
      ...handoff,
      completedEventId: input.eventId ?? handoff.completedEventId,
      status: "completed",
      updatedAt: input.now
    };
  }

  if (input.transition === "reject" && handoff.status === "requested") {
    return {
      ...handoff,
      status: "rejected",
      updatedAt: input.now
    };
  }

  if (input.transition === "expire" && handoff.status === "requested") {
    return {
      ...handoff,
      status: "expired",
      updatedAt: input.now
    };
  }

  if (
    input.transition === "cancel" &&
    (handoff.status === "requested" || handoff.status === "accepted")
  ) {
    return {
      ...handoff,
      status: "cancelled",
      updatedAt: input.now
    };
  }

  throw new Error(
    `Cannot transition handoff ${handoff.id} from ${handoff.status} via ${input.transition}.`
  );
}

export function assembleMultiAgentContext(
  input: AssembleMultiAgentContextInput
): MultiAgentBuiltContext {
  const maxSourceRefs = input.budget?.maxSourceRefs ?? 12;
  const maxTotalChars = input.budget?.maxTotalChars ?? 4_000;
  const sourceRefs: MultiAgentContextSourceRef[] = [];
  const sections: string[] = [];
  let totalChars = 0;

  const include = (source: MultiAgentContextSourceRef, content: string, required = false) => {
    if (
      !required &&
      (sourceRefs.length >= maxSourceRefs || totalChars + content.length > maxTotalChars)
    ) {
      sourceRefs.push({
        ...source,
        included: false,
        reason: "token_budget"
      });
      return;
    }

    sourceRefs.push(source);
    sections.push(content);
    totalChars += content.length;
  };

  include(
    sourceRef("role_contract", input.participant.id, "always", input.participant.roleContract),
    renderSection("role_contract", JSON.stringify(input.participant.roleContract, null, 2)),
    true
  );
  include(
    sourceRef("triggering_event", input.triggeringEvent.id, "always", input.triggeringEvent),
    renderSection("triggering_event", input.triggeringEvent.content),
    true
  );

  if (input.causalChain.summary) {
    include(
      sourceRef("causal_chain_summary", input.causalChain.id, "prefer", input.causalChain.summary),
      renderSection("causal_chain_summary", input.causalChain.summary)
    );
  }

  for (const event of input.events) {
    if (event.id === input.triggeringEvent.id) {
      continue;
    }

    if (event.visibility !== "public") {
      sourceRefs.push({
        included: false,
        reason: "visibility",
        refId: event.id,
        tokenEstimate: 0,
        type: "recent_channel_history"
      });
      continue;
    }

    include(
      sourceRef("recent_channel_history", event.id, "public_history", event),
      renderSection("recent_channel_history", event.content)
    );
  }

  for (const memory of input.privateMemory ?? []) {
    if (
      memory.status !== "approved" ||
      memory.ownerParticipantId !== input.participant.id ||
      !input.participant.memoryPolicy.canReadOwnPrivateMemory
    ) {
      sourceRefs.push({
        included: false,
        reason: "private_memory_scope",
        refId: memory.id,
        tokenEstimate: 0,
        type: "private_memory"
      });
      continue;
    }

    include(
      sourceRef("private_memory", memory.id, "own_private_memory", memory.summary),
      renderSection("private_memory", memory.summary)
    );
  }

  for (const memory of input.proceduralMemories ?? []) {
    if (
      memory.status !== "approved" ||
      !input.participant.memoryPolicy.canReadProceduralMemory ||
      (memory.ownerRoleKey && normalizeMention(memory.ownerRoleKey) !== normalizeMention(input.participant.roleKey))
    ) {
      sourceRefs.push({
        included: false,
        reason: "procedural_memory_not_approved_or_role_mismatch",
        refId: memory.id,
        tokenEstimate: 0,
        type: "procedural_memory"
      });
      continue;
    }

    include(
      sourceRef("procedural_memory", memory.id, "approved_procedure", memory.summary),
      renderSection("procedural_memory", memory.summary)
    );
  }

  const renderedPromptPreview = sections.join("\n\n");
  const snapshot = multiAgentContextSnapshotSchema.parse({
    agentParticipantId: input.participant.id,
    agentTurnId: createAgentTurnIdempotencyKey(input.turn),
    causalChainId: input.turn.causalChainId,
    channelId: input.turn.channelId,
    createdAt: new Date(0).toISOString(),
    id: `context:${input.turn.causalChainId}:${input.turn.agentParticipantId}:${input.turn.triggeringEventId}`,
    renderedPromptHash: hashText(renderedPromptPreview),
    renderedPromptPreview,
    sourceRefs,
    tokenEstimate: {
      bySourceType: estimateTokensBySourceType(sourceRefs),
      total: estimateTokens(renderedPromptPreview)
    },
    workspaceId: input.turn.workspaceId
  });

  return {
    renderedPromptPreview,
    snapshot
  };
}

export function verifyToolPlan(
  input: VerifyToolPlanInput
): MultiAgentPlanVerificationResult {
  const detectedRisks: MultiAgentPlanVerificationResult["detectedRisks"] = [];
  const reasons: string[] = [];

  if (!input.policy.canCreateToolPlan) {
    detectedRisks.push("policy_exceeds_allowed_risk");
    reasons.push("The participant is not allowed to create tool plans.");
    return verificationResult("deny", reasons, detectedRisks);
  }

  if (input.plan.riskLevel === "forbidden") {
    detectedRisks.push("forbidden_tool");
    reasons.push("The proposed tool plan is forbidden by policy.");
    return verificationResult("deny", reasons, detectedRisks);
  }

  const allowedRank = toolRiskAllowanceRank(input.policy.allowedToolRisk);
  const planRank = toolRiskRank(input.plan.riskLevel);

  if (allowedRank < planRank) {
    detectedRisks.push("policy_exceeds_allowed_risk");
    reasons.push("The proposed risk level exceeds the participant policy.");
    return verificationResult(
      input.plan.riskLevel === "high" ? "deny" : "needs_human_approval",
      reasons,
      detectedRisks
    );
  }

  if (
    input.plan.expectedSideEffects.length > 0 &&
    input.plan.riskLevel === "high" &&
    !input.plan.rollbackPlan
  ) {
    detectedRisks.push("missing_rollback");
    reasons.push("High-risk plans with side effects require a rollback plan.");
  }

  if (input.plan.riskLevel === "high" || detectedRisks.length > 0) {
    return verificationResult("needs_human_approval", reasons, detectedRisks);
  }

  return verificationResult("allow", reasons, detectedRisks);
}

export function createProceduralMemoryCandidate(
  input: CreateProceduralMemoryCandidateInput
): MultiAgentProceduralMemory {
  return multiAgentProceduralMemorySchema.parse({
    antiPatterns: input.antiPatterns ?? [],
    createdAt: input.now,
    id: input.id,
    ownerRoleKey: input.ownerRoleKey ?? null,
    scope: input.ownerRoleKey ? "agent_role" : "workspace",
    sourceCausalChainId: input.causalChainId,
    status: "candidate",
    steps: input.steps,
    summary: input.summary,
    title: input.title,
    updatedAt: input.now,
    workspaceId: input.workspaceId
  });
}

export function approveProceduralMemory(input: {
  memory: MultiAgentProceduralMemory;
  now: string;
}): MultiAgentProceduralMemory {
  return {
    ...input.memory,
    status: "approved",
    updatedAt: input.now
  };
}

export function recordProceduralMemoryUse(input: {
  memory: MultiAgentProceduralMemory;
  now: string;
  outcome: "success" | "failure";
}): MultiAgentProceduralMemory {
  return {
    ...input.memory,
    failureCount:
      input.outcome === "failure"
        ? input.memory.failureCount + 1
        : input.memory.failureCount,
    lastUsedAt: input.now,
    successCount:
      input.outcome === "success"
        ? input.memory.successCount + 1
        : input.memory.successCount,
    updatedAt: input.now
  };
}

export function computeTrajectoryMetrics(input: {
  events: MultiAgentChannelEvent[];
  finalOutcome: MultiAgentTrajectoryMetrics["finalOutcome"];
  handoffs: MultiAgentHandoff[];
  turns: MultiAgentTurnCandidate[];
}): MultiAgentTrajectoryMetrics {
  const handoffCount = input.handoffs.length;
  const completedHandoffCount = input.handoffs.filter(
    (handoff) => handoff.status === "completed"
  ).length;

  return multiAgentTrajectoryMetricsSchema.parse({
    agentToAgentTurnCount: input.turns.filter(
      (turn) => turn.sourceAgentParticipantId
    ).length,
    finalOutcome: input.finalOutcome,
    handoffCount,
    handoffSuccessRate:
      handoffCount === 0 ? 0 : completedHandoffCount / handoffCount,
    humanInterventionCount: input.events.filter(
      (event) => event.authorType === "human" && event.type === "user_message"
    ).length,
    loopGuardTriggered: input.events.some(
      (event) => event.type === "loop_guard_triggered"
    ),
    turnCount: input.turns.length
  });
}

function selectHumanEventCandidates(
  input: SelectMultiAgentTurnCandidatesInput
): MultiAgentTurnCandidate[] {
  return input.mentions.flatMap((mention) => {
    if (mention.kind === "all_agents" && mention.requiresHumanConfirmation && !input.allAgentsConfirmed) {
      return [];
    }

    const reason = reasonForHumanMention(mention.kind);

    if (!reason) {
      return [];
    }

    return mention.targetParticipantIds.flatMap((participantId) => {
      const participant = input.participants.find((entry) => entry.id === participantId);

      if (!participant || !participantAllowsReason(participant, reason)) {
        return [];
      }

      return [turnCandidate(input.event, participant, reason, null)];
    });
  });
}

function selectAgentEventCandidates(
  input: SelectMultiAgentTurnCandidatesInput
): MultiAgentTurnCandidate[] {
  if (input.event.type !== "critique_request") {
    return [];
  }

  return input.mentions.flatMap((mention) =>
    mention.targetParticipantIds.flatMap((participantId) => {
      const participant = input.participants.find((entry) => entry.id === participantId);

      if (!participant || !participant.triggerPolicy.respondToAgentMentions) {
        return [];
      }

      if (!allowsBotOriginatedMention(input.event, participant, "agent_mention_allowed")) {
        return [];
      }

      return [
        turnCandidate(
          input.event,
          participant,
          "agent_mention_allowed",
          input.event.authorId
        )
      ];
    })
  );
}

function selectHandoffCandidates(
  input: SelectMultiAgentTurnCandidatesInput
): MultiAgentTurnCandidate[] {
  const targetParticipantIds = resolveHandoffTargetParticipantIds(input);

  return targetParticipantIds.flatMap((participantId) => {
    const participant = input.participants.find((entry) => entry.id === participantId);

    if (!participant) {
      return [];
    }

    return [
      turnCandidate(input.event, participant, "agent_handoff", input.event.authorId)
    ];
  });
}

function resolveHandoffTargetParticipantIds(
  input: SelectMultiAgentTurnCandidatesInput
): string[] {
  const payload = input.event.structuredPayload;
  const explicitTarget =
    typeof payload.targetParticipantId === "string" ? payload.targetParticipantId : null;
  const explicitTargets = Array.isArray(payload.targetParticipantIds)
    ? payload.targetParticipantIds.filter((entry): entry is string => typeof entry === "string")
    : [];
  const targetRoleKey =
    typeof payload.targetRoleKey === "string" ? normalizeMention(payload.targetRoleKey) : null;

  if (explicitTarget) {
    return [explicitTarget];
  }

  if (explicitTargets.length > 0) {
    return explicitTargets;
  }

  if (targetRoleKey) {
    return input.participants
      .filter((participant) => participantMatchesRoleMention(participant, targetRoleKey))
      .map((participant) => participant.id);
  }

  return input.mentions.flatMap((mention) => mention.targetParticipantIds);
}

function reasonForHumanMention(
  kind: MultiAgentResolvedMention["kind"]
): MultiAgentTurnReason | null {
  switch (kind) {
    case "agent":
      return "human_mention";
    case "role":
      return "human_role_mention";
    case "all_agents":
      return "human_all_agents";
    case "reply_target":
      return "reply_to_agent";
  }
}

function participantAllowsReason(
  participant: MultiAgentParticipant,
  reason: MultiAgentTurnReason
): boolean {
  switch (reason) {
    case "human_mention":
      return participant.triggerPolicy.respondToHumanMentions;
    case "human_role_mention":
      return participant.triggerPolicy.respondToRoleMentions;
    case "human_all_agents":
      return participant.triggerPolicy.respondToAllAgents;
    case "reply_to_agent":
      return participant.triggerPolicy.respondToReplyToSelf;
    case "agent_mention_allowed":
      return participant.triggerPolicy.respondToAgentMentions;
    case "agent_handoff":
    case "manual_retry":
    case "scheduled_followup":
      return true;
  }
}

function allowsBotOriginatedMention(
  event: MultiAgentChannelEvent,
  participant: MultiAgentParticipant,
  reason: MultiAgentTurnReason
): boolean {
  if (reason === "agent_handoff") {
    return true;
  }

  switch (participant.triggerPolicy.allowBotOriginatedMentions) {
    case "explicit":
      return true;
    case "same_causal_chain":
      return Boolean(event.causalChainId);
    case "handoff_only":
    case "never":
      return false;
  }
}

function turnCandidate(
  event: MultiAgentChannelEvent,
  participant: MultiAgentParticipant,
  reason: MultiAgentTurnReason,
  sourceAgentParticipantId: string | null
): MultiAgentTurnCandidate {
  return {
    agentId: participant.agentId,
    agentParticipantId: participant.id,
    causalChainId: event.causalChainId ?? event.id,
    channelId: event.channelId,
    priority: priorityForReason(reason),
    reason,
    sourceAgentParticipantId,
    triggeringEventId: event.id,
    workspaceId: event.workspaceId
  };
}

function priorityForReason(reason: MultiAgentTurnReason): number {
  switch (reason) {
    case "human_mention":
      return 100;
    case "reply_to_agent":
      return 95;
    case "agent_handoff":
      return 90;
    case "human_role_mention":
      return 80;
    case "agent_mention_allowed":
      return 60;
    case "human_all_agents":
      return 50;
    case "manual_retry":
      return 40;
    case "scheduled_followup":
      return 20;
  }
}

function block(
  guard: MultiAgentLoopGuard,
  suggestedActions: string[]
): MultiAgentLoopGuardDecision {
  return {
    action: "block",
    guard,
    suggestedActions
  };
}

function countConsecutiveAgentEventsSinceHuman(
  events: MultiAgentChannelEvent[]
): number {
  let count = 0;

  for (const event of [...events].reverse()) {
    if (event.authorType === "human") {
      break;
    }

    if (event.authorType === "agent") {
      count += 1;
    }
  }

  return count;
}

function countRecentSamePairAgentEvents(input: {
  events: MultiAgentChannelEvent[];
  sourceAgentId: string;
  targetAgentId: string;
}): number {
  let count = 0;
  const pair = new Set([input.sourceAgentId, input.targetAgentId]);

  for (const event of [...input.events].reverse()) {
    if (event.authorType === "human") {
      break;
    }

    if (event.authorType !== "agent") {
      continue;
    }

    if (!pair.has(event.authorId)) {
      break;
    }

    count += 1;
  }

  return count;
}

function sourceRef(
  type: MultiAgentContextSourceRef["type"],
  refId: string,
  reason: string,
  content: unknown
): MultiAgentContextSourceRef {
  return {
    included: true,
    reason,
    refId,
    tokenEstimate: estimateTokens(
      typeof content === "string" ? content : JSON.stringify(content)
    ),
    type
  };
}

function estimateTokensBySourceType(
  sourceRefs: MultiAgentContextSourceRef[]
): Record<string, number> {
  const totals: Record<string, number> = {};

  for (const sourceRefEntry of sourceRefs) {
    totals[sourceRefEntry.type] =
      (totals[sourceRefEntry.type] ?? 0) + sourceRefEntry.tokenEstimate;
  }

  return totals;
}

function renderSection(title: string, content: string): string {
  return `<${title}>\n${content}\n</${title}>`;
}

function verificationResult(
  verdict: MultiAgentPlanVerificationResult["verdict"],
  reasons: string[],
  detectedRisks: MultiAgentPlanVerificationResult["detectedRisks"]
): MultiAgentPlanVerificationResult {
  return multiAgentPlanVerificationResultSchema.parse({
    detectedRisks,
    reasons,
    verdict
  });
}

function toolRiskRank(risk: MultiAgentToolPlan["riskLevel"]): number {
  switch (risk) {
    case "low":
      return 1;
    case "medium":
      return 2;
    case "high":
      return 3;
    case "forbidden":
      return 4;
  }
}

function toolRiskAllowanceRank(
  allowance: MultiAgentPermissionPolicy["allowedToolRisk"]
): number {
  switch (allowance) {
    case "none":
      return 0;
    case "low":
      return 1;
    case "medium":
      return 2;
    case "high_with_approval":
      return 3;
  }
}

function participantMatchesAgentMention(
  participant: MultiAgentParticipant,
  mentionToken: string,
  normalizedMention: string
): boolean {
  return (
    participant.displayName === mentionToken ||
    participant.aliases.some((alias) => normalizeMention(alias) === normalizedMention)
  );
}

function participantMatchesRoleMention(
  participant: MultiAgentParticipant,
  normalizedMentionValue: string
): boolean {
  return (
    normalizeMention(participant.roleKey) === normalizedMentionValue ||
    normalizeMention(participant.roleLabel) === normalizedMentionValue ||
    participant.roleTags.some(
      (roleTag) => normalizeMention(roleTag) === normalizedMentionValue
    )
  );
}

function isActiveParticipant(participant: MultiAgentParticipant): boolean {
  return participant.status !== "muted" && participant.status !== "offline";
}

function estimateTokens(content: string): number {
  return Math.ceil(content.length / 4);
}

function hashText(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

function extractJsonCandidates(rawText: string): string[] {
  const candidates = new Set<string>();
  const fencedJsonPattern = /```(?:json)?\s*([\s\S]*?)```/gi;

  for (const match of rawText.matchAll(fencedJsonPattern)) {
    const candidate = match[1]?.trim();

    if (candidate) {
      candidates.add(candidate);
    }
  }

  const trimmed = rawText.trim();

  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    candidates.add(trimmed);
  }

  for (const candidate of extractTrailingJsonObjectCandidates(trimmed)) {
    candidates.add(candidate);
  }

  return [...candidates];
}

function extractTrailingJsonObjectCandidates(rawText: string): string[] {
  if (!rawText.endsWith("}")) {
    return [];
  }

  const candidates: string[] = [];

  for (const match of rawText.matchAll(/\{/g)) {
    const candidate = rawText.slice(match.index).trim();

    if (candidate.startsWith("{") && candidate.endsWith("}")) {
      candidates.push(candidate);
    }
  }

  return candidates;
}

function parseJsonObject(
  candidate: string
): { ok: true; value: unknown } | { error: string; ok: false } {
  try {
    const parsed = JSON.parse(candidate) as unknown;

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {
        error: "Agent output envelope must be a JSON object.",
        ok: false
      };
    }

    return {
      ok: true,
      value: parsed
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Invalid JSON envelope.",
      ok: false
    };
  }
}

function normalizeMention(value: string): string {
  return value.trim().replace(/^@/, "").toLowerCase();
}
