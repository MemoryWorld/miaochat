import type {
  AgentActorChannelEvent,
  AgentActorHeartbeatPolicy,
  AgentActorHeartbeatResponse,
  AgentActorLoopGuardDecision,
  AgentActorMailboxEvent,
  AgentActorMailboxEventKind,
  AgentActorParticipant,
  AgentActorSession,
  AgentActorSessionStatus,
  AgentActorTurnCandidate,
  AgentActorTurnReason,
  AgentActorWakeDecision,
  AgentActorWakeReason,
  AgentActorWakeRun
} from "@agenthub/contracts";

export type AgentActorWakeDecisionInput = {
  mailboxEvents: AgentActorMailboxEvent[];
  now: string;
  recentWakeRuns?: AgentActorWakeRun[];
  session: AgentActorSession;
};

export type AgentActorStateTransitionInput = {
  now: string;
  session: AgentActorSession;
};

export type AgentActorTurnCandidateInput = {
  event: AgentActorChannelEvent;
  participants: AgentActorParticipant[];
};

export type AgentActorLoopGuardInput = {
  candidate: AgentActorTurnCandidate;
  causalChainEvents: AgentActorChannelEvent[];
  now: string;
  participant: AgentActorParticipant;
  recentWakeRuns?: AgentActorWakeRun[];
};

const heartbeatEventPriority = 10;

const defaultEventPriorities: Record<AgentActorMailboxEventKind, number> = {
  user_message: 100,
  manual_wake: 95,
  handoff_artifact: 90,
  agent_message: 85,
  tool_receipt: 80,
  memory_proposal: 50,
  system_notice: 40,
  heartbeat_tick: heartbeatEventPriority
};

const wakeReasonsByEventKind: Record<
  AgentActorMailboxEventKind,
  AgentActorWakeReason
> = {
  agent_message: "agent_message",
  handoff_artifact: "handoff_artifact",
  heartbeat_tick: "heartbeat_due",
  manual_wake: "manual_wake",
  memory_proposal: "memory_review_due",
  system_notice: "system_notice",
  tool_receipt: "tool_receipt",
  user_message: "user_message"
};

const turnReasonPriorities: Record<AgentActorTurnReason, number> = {
  human_mention: 100,
  handoff: 95,
  manual: 90,
  reply_to_agent: 85,
  agent_mention: 80,
  role_mention: 70,
  all_agents_mention: 50,
  scheduler: 20
};

export function isAgentActorBusyStatus(status: AgentActorSessionStatus): boolean {
  return status === "waking" || status === "running" || status === "waiting";
}

export function sortAgentActorMailboxEvents(
  events: AgentActorMailboxEvent[]
): AgentActorMailboxEvent[] {
  return [...events].sort((left, right) => {
    const leftPriority = resolveEventPriority(left);
    const rightPriority = resolveEventPriority(right);

    if (leftPriority !== rightPriority) {
      return rightPriority - leftPriority;
    }

    const createdDelta = toMs(left.createdAt) - toMs(right.createdAt);

    if (createdDelta !== 0) {
      return createdDelta;
    }

    return left.id.localeCompare(right.id);
  });
}

export function selectAgentActorWakeDecision(
  input: AgentActorWakeDecisionInput
): AgentActorWakeDecision {
  const { session } = input;

  if (session.status === "stopped") {
    return skipDecision("stopped");
  }

  const availableEvents = selectAvailableEvents(input.mailboxEvents, input.now);
  const interactiveEvents = sortAgentActorMailboxEvents(
    availableEvents.filter((event) => event.kind !== "heartbeat_tick")
  );
  const urgentInteractiveEvents = interactiveEvents.filter(
    (event) => session.status !== "sleeping" || canWakeSleepingSession(event.kind)
  );

  if (urgentInteractiveEvents.length > 0) {
    const selectedEvents = urgentInteractiveEvents.slice(
      0,
      session.heartbeatPolicy.maxEventsPerWake
    );
    const primaryEvent = selectedEvents[0];

    if (!primaryEvent) {
      return skipDecision("empty_mailbox");
    }

    const primaryReason = wakeReasonsByEventKind[primaryEvent.kind];

    return {
      action: "wake",
      reason: primaryReason,
      selectedEventIds: selectedEvents.map((event) => event.id),
      shouldCallModel: true,
      shouldEmitMessage: primaryReason !== "memory_review_due",
      skipReason: null
    };
  }

  if (session.status === "sleeping") {
    return skipDecision("sleeping");
  }

  const heartbeatEvents = availableEvents.filter(
    (event) => event.kind === "heartbeat_tick"
  );

  return selectHeartbeatWakeDecision({
    heartbeatEventIds: heartbeatEvents.map((event) => event.id),
    now: input.now,
    recentWakeRuns: input.recentWakeRuns ?? [],
    session
  });
}

export function selectAgentActorTurnCandidates(
  input: AgentActorTurnCandidateInput
): AgentActorTurnCandidate[] {
  if (input.event.visibility !== "public") {
    return [];
  }

  const candidates = input.participants.flatMap((participant) =>
    selectParticipantTurnCandidates(input.event, participant)
  );
  const candidatesByAgent = new Map<string, AgentActorTurnCandidate>();

  for (const candidate of candidates) {
    const existing = candidatesByAgent.get(candidate.agentId);

    if (!existing || candidate.priority > existing.priority) {
      candidatesByAgent.set(candidate.agentId, candidate);
    }
  }

  return [...candidatesByAgent.values()].sort((left, right) => {
    if (left.priority !== right.priority) {
      return right.priority - left.priority;
    }

    return left.agentId.localeCompare(right.agentId);
  });
}

export function evaluateAgentActorLoopGuard(
  input: AgentActorLoopGuardInput
): AgentActorLoopGuardDecision {
  const { candidate, participant } = input;
  const policy = participant.triggerPolicy;

  if (participant.status === "muted") {
    return skipTurn("muted");
  }

  if (participant.status === "offline") {
    return skipTurn("offline");
  }

  if (isWithinParticipantCooldown(input)) {
    return skipTurn("cooldown");
  }

  const chainAgentEvents = input.causalChainEvents.filter(
    (event) => event.author.type === "agent"
  );

  if (chainAgentEvents.length >= policy.maxTurnsPerCausalChain) {
    return skipTurn("causal_chain_budget_exhausted");
  }

  if (
    candidate.sourceAgentId &&
    chainAgentEvents.length >= policy.maxAgentToAgentTurns
  ) {
    return skipTurn("agent_to_agent_budget_exhausted");
  }

  if (
    candidate.sourceAgentId &&
    countConsecutiveAgentEventsSinceHuman(input.causalChainEvents) >=
      policy.maxConsecutiveTurnsWithoutHuman
  ) {
    return skipTurn("no_human_checkpoint");
  }

  if (
    candidate.sourceAgentId &&
    countRecentSamePairTurns({
      events: input.causalChainEvents,
      sourceAgentId: candidate.sourceAgentId,
      targetAgentId: candidate.agentId
    }) >= policy.maxSamePairPingPong
  ) {
    return skipTurn("same_pair_ping_pong");
  }

  return {
    action: "allow",
    skipReason: null
  };
}

export function createAgentActorMailboxEventFromTurnCandidate(input: {
  candidate: AgentActorTurnCandidate;
  event: AgentActorChannelEvent;
  id: string;
  now: string;
  sessionId: string;
}): AgentActorMailboxEvent {
  return {
    agentId: input.candidate.agentId,
    availableAt: input.now,
    conversationId: input.event.conversationId,
    createdAt: input.now,
    dedupeKey: `channel-turn:${input.event.id}:${input.candidate.agentId}`,
    expiresAt: null,
    id: input.id,
    kind: resolveMailboxKindForChannelTurn(input.event),
    payload: {
      causalChainId: input.candidate.causalChainId,
      channelEventId: input.event.id,
      channelId: input.event.channelId,
      content: input.event.content,
      triggerReason: input.candidate.reason
    },
    priority: input.candidate.priority,
    sessionId: input.sessionId,
    sourceAgentId: input.candidate.sourceAgentId,
    sourceRunId: null,
    status: "queued",
    workspaceId: input.candidate.workspaceId
  };
}

export function createAgentActorHeartbeatTickEvent(input: {
  agentId: string;
  conversationId?: string | null;
  id: string;
  now: string;
  sessionId: string;
  workspaceId: string;
}): AgentActorMailboxEvent {
  return {
    agentId: input.agentId,
    availableAt: input.now,
    conversationId: input.conversationId ?? null,
    createdAt: input.now,
    dedupeKey: null,
    expiresAt: null,
    id: input.id,
    kind: "heartbeat_tick",
    payload: {
      promptContract: "HEARTBEAT_OK_ALLOWED"
    },
    priority: heartbeatEventPriority,
    sessionId: input.sessionId,
    sourceAgentId: null,
    sourceRunId: null,
    status: "queued",
    workspaceId: input.workspaceId
  };
}

export function createAgentActorWakeRun(input: {
  decision: AgentActorWakeDecision;
  id: string;
  now: string;
  session: AgentActorSession;
}): AgentActorWakeRun {
  return {
    agentId: input.session.agentId,
    completedAt: null,
    decision: input.decision,
    id: input.id,
    messageEmitted: input.decision.shouldEmitMessage,
    modelCalled: input.decision.shouldCallModel,
    reason: input.decision.reason,
    selectedEventIds: input.decision.selectedEventIds,
    sessionId: input.session.id,
    startedAt: input.now,
    status: input.decision.action === "wake" ? "started" : "skipped",
    workspaceId: input.session.workspaceId
  };
}

export function markAgentActorRunning(input: {
  now: string;
  runId: string;
  session: AgentActorSession;
}): AgentActorSession {
  return {
    ...input.session,
    activeRunId: input.runId,
    lastWakeAt: input.now,
    status: "running",
    updatedAt: input.now
  };
}

export function markAgentActorIdle(
  input: AgentActorStateTransitionInput
): AgentActorSession {
  return {
    ...input.session,
    activeRunId: null,
    status: "idle",
    updatedAt: input.now
  };
}

export function markAgentActorHeartbeatObserved(
  input: AgentActorStateTransitionInput
): AgentActorSession {
  return {
    ...input.session,
    lastHeartbeatAt: input.now,
    updatedAt: input.now
  };
}

export function interpretAgentActorHeartbeatResponse(input: {
  content: string;
  policy: AgentActorHeartbeatPolicy;
}): AgentActorHeartbeatResponse {
  const trimmed = input.content.trim();
  const startToken = "HEARTBEAT_OK";
  const startsWithAck = trimmed.startsWith(startToken);
  const endsWithAck = trimmed.endsWith(startToken);

  if (!startsWithAck && !endsWithAck) {
    return {
      ackMatched: false,
      cleanedContent: trimmed,
      shouldEmitMessage: trimmed.length > 0
    };
  }

  const cleanedContent = (startsWithAck
    ? trimmed.slice(startToken.length)
    : trimmed.slice(0, -startToken.length)
  ).trim();

  if (cleanedContent.length <= input.policy.ackMaxChars) {
    return {
      ackMatched: true,
      cleanedContent,
      shouldEmitMessage: false
    };
  }

  return {
    ackMatched: false,
    cleanedContent: trimmed,
    shouldEmitMessage: true
  };
}

function selectHeartbeatWakeDecision(input: {
  heartbeatEventIds: string[];
  now: string;
  recentWakeRuns: AgentActorWakeRun[];
  session: AgentActorSession;
}): AgentActorWakeDecision {
  const policy = input.session.heartbeatPolicy;

  if (!policy.enabled) {
    return skipDecision("heartbeat_disabled", input.heartbeatEventIds);
  }

  if (policy.skipWhenBusy && isAgentActorBusyStatus(input.session.status)) {
    return skipDecision("busy", input.heartbeatEventIds);
  }

  if (!isWithinActiveHours(policy, input.now)) {
    return skipDecision("outside_active_hours", input.heartbeatEventIds);
  }

  if (input.session.lastWakeAt) {
    const quietWindowRemaining =
      toMs(input.now) - toMs(input.session.lastWakeAt) < policy.quietWindowMs;

    if (quietWindowRemaining) {
      return skipDecision("quiet_window", input.heartbeatEventIds);
    }
  }

  if (input.session.lastHeartbeatAt) {
    const heartbeatDue =
      toMs(input.now) - toMs(input.session.lastHeartbeatAt) >= policy.intervalMs;

    if (!heartbeatDue) {
      return skipDecision("not_due", input.heartbeatEventIds);
    }
  }

  if (hasExceededHourlyWakeBudget(input)) {
    return skipDecision("budget_exhausted", input.heartbeatEventIds);
  }

  return {
    action: "wake",
    reason: "heartbeat_due",
    selectedEventIds: input.heartbeatEventIds,
    shouldCallModel: true,
    shouldEmitMessage: policy.target !== "none",
    skipReason: null
  };
}

function hasExceededHourlyWakeBudget(input: {
  now: string;
  recentWakeRuns: AgentActorWakeRun[];
  session: AgentActorSession;
}): boolean {
  const oneHourAgoMs = toMs(input.now) - 60 * 60 * 1000;
  const wakeRunsInWindow = input.recentWakeRuns.filter(
    (run) =>
      run.reason === "heartbeat_due" &&
      run.modelCalled &&
      toMs(run.startedAt) >= oneHourAgoMs
  );

  return wakeRunsInWindow.length >= input.session.heartbeatPolicy.maxWakeRunsPerHour;
}

function selectParticipantTurnCandidates(
  event: AgentActorChannelEvent,
  participant: AgentActorParticipant
): AgentActorTurnCandidate[] {
  if (
    event.workspaceId !== participant.workspaceId ||
    event.channelId !== participant.channelId
  ) {
    return [];
  }

  if (event.author.type === "agent" && event.author.id === participant.agentId) {
    return [];
  }

  const sourceAgentId = event.author.type === "agent" ? event.author.id : null;
  const candidates: AgentActorTurnCandidate[] = [];

  for (const mention of event.mentions) {
    const reason = resolveTurnReasonForMention(event, participant, mention);

    if (!reason) {
      continue;
    }

    if (
      event.author.type === "agent" &&
      !allowsBotOriginatedMention({
        event,
        participant,
        reason
      })
    ) {
      continue;
    }

    candidates.push({
      agentId: participant.agentId,
      causalChainId: event.causalChainId ?? event.id,
      channelId: event.channelId,
      priority: turnReasonPriorities[reason],
      reason,
      sourceAgentId,
      triggeringEventId: event.id,
      workspaceId: event.workspaceId
    });
  }

  return candidates;
}

function resolveTurnReasonForMention(
  event: AgentActorChannelEvent,
  participant: AgentActorParticipant,
  mention: AgentActorChannelEvent["mentions"][number]
): AgentActorTurnReason | null {
  const policy = participant.triggerPolicy;

  if (mention.targetType === "agent") {
    if (mention.targetId !== participant.agentId) {
      return null;
    }

    if (event.type === "handoff") {
      return "handoff";
    }

    if (event.author.type === "human" && policy.respondToHumanMentions) {
      return "human_mention";
    }

    if (event.author.type === "agent" && policy.respondToAgentMentions) {
      return "agent_mention";
    }

    return null;
  }

  if (mention.targetType === "role") {
    if (!mention.targetId || !participantMatchesRole(participant, mention.targetId)) {
      return null;
    }

    if (!policy.respondToRoleMentions) {
      return null;
    }

    if (event.author.type === "agent" && !policy.respondToAgentMentions) {
      return null;
    }

    return event.type === "handoff" ? "handoff" : "role_mention";
  }

  if (mention.targetType === "all_agents") {
    if (!policy.respondToAllAgents) {
      return null;
    }

    if (event.author.type === "agent" && !policy.respondToAgentMentions) {
      return null;
    }

    return "all_agents_mention";
  }

  return null;
}

function allowsBotOriginatedMention(input: {
  event: AgentActorChannelEvent;
  participant: AgentActorParticipant;
  reason: AgentActorTurnReason;
}): boolean {
  if (input.reason === "handoff") {
    return true;
  }

  switch (input.participant.triggerPolicy.botOriginatedMentionPolicy) {
    case "explicit":
      return true;
    case "same_causal_chain":
      return Boolean(input.event.causalChainId);
    case "never":
      return false;
  }
}

function participantMatchesRole(
  participant: AgentActorParticipant,
  roleTarget: string
): boolean {
  const normalizedTarget = normalizeRole(roleTarget);

  return (
    normalizeRole(participant.role) === normalizedTarget ||
    participant.roleTags.some((roleTag) => normalizeRole(roleTag) === normalizedTarget)
  );
}

function resolveMailboxKindForChannelTurn(
  event: AgentActorChannelEvent
): AgentActorMailboxEventKind {
  if (event.type === "handoff") {
    return "handoff_artifact";
  }

  if (event.author.type === "agent") {
    return "agent_message";
  }

  return "user_message";
}

function isWithinParticipantCooldown(input: AgentActorLoopGuardInput): boolean {
  const cooldownMs = input.participant.triggerPolicy.cooldownMs;

  if (cooldownMs === 0) {
    return false;
  }

  return (input.recentWakeRuns ?? []).some(
    (run) =>
      run.agentId === input.candidate.agentId &&
      run.modelCalled &&
      toMs(input.now) - toMs(run.startedAt) < cooldownMs
  );
}

function countConsecutiveAgentEventsSinceHuman(
  events: AgentActorChannelEvent[]
): number {
  let count = 0;

  for (const event of [...events].reverse()) {
    if (event.author.type === "human") {
      break;
    }

    if (event.author.type === "agent") {
      count += 1;
    }
  }

  return count;
}

function countRecentSamePairTurns(input: {
  events: AgentActorChannelEvent[];
  sourceAgentId: string;
  targetAgentId: string;
}): number {
  let count = 0;
  const pair = new Set([input.sourceAgentId, input.targetAgentId]);

  for (const event of [...input.events].reverse()) {
    if (event.author.type === "human") {
      break;
    }

    if (event.author.type !== "agent") {
      continue;
    }

    if (!pair.has(event.author.id)) {
      break;
    }

    count += 1;
  }

  return count;
}

function normalizeRole(value: string): string {
  return value.trim().toLowerCase();
}

function selectAvailableEvents(
  events: AgentActorMailboxEvent[],
  now: string
): AgentActorMailboxEvent[] {
  const nowMs = toMs(now);

  return events.filter((event) => {
    if (event.status !== "queued") {
      return false;
    }

    if (toMs(event.availableAt) > nowMs) {
      return false;
    }

    return !event.expiresAt || toMs(event.expiresAt) > nowMs;
  });
}

function canWakeSleepingSession(kind: AgentActorMailboxEventKind): boolean {
  return kind === "manual_wake" || kind === "user_message";
}

function resolveEventPriority(event: AgentActorMailboxEvent): number {
  return event.priority || defaultEventPriorities[event.kind];
}

function isWithinActiveHours(
  policy: AgentActorHeartbeatPolicy,
  now: string
): boolean {
  if (!policy.activeHours) {
    return true;
  }

  const currentMinutes = localMinutesForTimezone(
    now,
    policy.activeHours.timezone
  );
  const startMinutes = clockTimeToMinutes(policy.activeHours.start);
  const endMinutes = clockTimeToMinutes(policy.activeHours.end);

  if (startMinutes < endMinutes) {
    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  }

  return currentMinutes >= startMinutes || currentMinutes < endMinutes;
}

function localMinutesForTimezone(timestamp: string, timezone: string): number {
  const date = new Date(timestamp);
  const formatterOptions = {
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    timeZone: timezone
  } satisfies Intl.DateTimeFormatOptions;
  const parts = safeDateTimeFormatParts(date, formatterOptions);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
  const minute = Number(
    parts.find((part) => part.type === "minute")?.value ?? "0"
  );

  return hour * 60 + minute;
}

function safeDateTimeFormatParts(
  date: Date,
  options: Intl.DateTimeFormatOptions
): Intl.DateTimeFormatPart[] {
  try {
    return new Intl.DateTimeFormat("en-US", options).formatToParts(date);
  } catch {
    return new Intl.DateTimeFormat("en-US", {
      ...options,
      timeZone: "UTC"
    }).formatToParts(date);
  }
}

function clockTimeToMinutes(clockTime: string): number {
  const [hour = "0", minute = "0"] = clockTime.split(":");

  return Number(hour) * 60 + Number(minute);
}

function skipDecision(
  skipReason: NonNullable<AgentActorWakeDecision["skipReason"]>,
  selectedEventIds: string[] = []
): AgentActorWakeDecision {
  return {
    action: "skip",
    reason: null,
    selectedEventIds,
    shouldCallModel: false,
    shouldEmitMessage: false,
    skipReason
  };
}

function skipTurn(
  skipReason: NonNullable<AgentActorLoopGuardDecision["skipReason"]>
): AgentActorLoopGuardDecision {
  return {
    action: "skip",
    skipReason
  };
}

function toMs(timestamp: string): number {
  return new Date(timestamp).getTime();
}
