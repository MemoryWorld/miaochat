import type {
  MultiAgentOutputEnvelope,
  OrchestratorFailure,
  OrchestratorStatusEventPayload,
  ProviderId,
  StreamEvent
} from "@agenthub/contracts";

export type OrchestratorStatus =
  | "aggregated"
  | "dispatched"
  | "partial_failure"
  | "received"
  | "running";

export type OrchestratorTarget = {
  agentId: string;
  agentName: string;
  capabilityTags?: string[];
  outputStyle?: string | null;
  participantId?: string;
  provider: ProviderId;
  scopeDescription?: string | null;
  systemPrompt?: string | null;
};

export type OrchestratorResult = OrchestratorTarget & {
  finalContent: string;
  harnessOutput?: MultiAgentOutputEnvelope;
  roundIndex?: number;
  turnIndex?: number;
};

export type OrchestratorState = {
  conversationId: string;
  failures: OrchestratorFailure[];
  message: string;
  results: OrchestratorResult[];
  status: OrchestratorStatus;
  statusHistory: OrchestratorStatus[];
  targets: OrchestratorTarget[];
  workspaceId: string;
};

export function createOrchestratorState(input: {
  conversationId: string;
  message: string;
  targets: OrchestratorTarget[];
  workspaceId: string;
}): OrchestratorState {
  return {
    conversationId: input.conversationId,
    failures: [],
    message: input.message,
    results: [],
    status: "received",
    statusHistory: ["received"],
    targets: [...input.targets],
    workspaceId: input.workspaceId
  };
}

export function advanceOrchestratorState(
  state: OrchestratorState,
  status: OrchestratorStatus
): OrchestratorState {
  if (state.status === status) {
    return state;
  }

  return {
    ...state,
    status,
    statusHistory: [...state.statusHistory, status]
  };
}

export function recordOrchestratorResults(
  state: OrchestratorState,
  results: OrchestratorResult[]
): OrchestratorState {
  return {
    ...state,
    results: [...results]
  };
}

export function recordOrchestratorFailures(
  state: OrchestratorState,
  failures: OrchestratorFailure[]
): OrchestratorState {
  return {
    ...state,
    failures: [...failures]
  };
}

export function recordOrchestratorTargets(
  state: OrchestratorState,
  targets: OrchestratorTarget[]
): OrchestratorState {
  return {
    ...state,
    targets: uniqueTargets(targets)
  };
}

export function toOrchestratorStatusEvent(
  state: OrchestratorState
): StreamEvent {
  const payload: OrchestratorStatusEventPayload = {
    failures: [...state.failures],
    label: `orchestrator.${state.status}`,
    state: resolveStreamState(state.status),
    successfulAgentCount: state.results.length,
    summary: resolveStatusSummary(state),
    totalAgentCount: state.targets.length
  };

  return {
    kind: "conversation.status",
    payload
  };
}

function resolveStreamState(
  status: OrchestratorStatus
): OrchestratorStatusEventPayload["state"] {
  if (status === "aggregated") {
    return "succeeded";
  }

  if (status === "partial_failure") {
    return "failed";
  }

  return "running";
}

function resolveStatusSummary(state: OrchestratorState): string {
  const totalAgentCount = state.targets.length;
  const successfulAgentCount = state.results.length;
  const failedAgentCount = state.failures.length;

  switch (state.status) {
    case "received":
      return `Accepted the group request for ${totalAgentCount} agents.`;
    case "dispatched":
      return `Dispatching ${totalAgentCount} agent tasks.`;
    case "running":
      return `Waiting for ${totalAgentCount} agent results.`;
    case "partial_failure":
      return failedAgentCount === totalAgentCount
        ? `${failedAgentCount} of ${totalAgentCount} agents failed or timed out. No successful results remain.`
        : `${failedAgentCount} of ${totalAgentCount} agents failed or timed out. Aggregated the remaining ${pluralize("result", successfulAgentCount)}.`;
    case "aggregated":
      return failedAgentCount > 0
        ? `Completed with degraded output from ${successfulAgentCount} of ${totalAgentCount} agents.`
        : `Aggregated ${successfulAgentCount} of ${totalAgentCount} agent results.`;
  }
}

function pluralize(noun: string, count: number): string {
  return count === 1 ? noun : `${noun}s`;
}

function uniqueTargets(targets: OrchestratorTarget[]): OrchestratorTarget[] {
  const seen = new Set<string>();
  const unique: OrchestratorTarget[] = [];

  for (const target of targets) {
    if (seen.has(target.agentId)) {
      continue;
    }

    seen.add(target.agentId);
    unique.push(target);
  }

  return unique;
}
