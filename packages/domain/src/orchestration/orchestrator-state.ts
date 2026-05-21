import type { ProviderId, StreamEvent } from "@agenthub/contracts";

export type OrchestratorStatus =
  | "aggregated"
  | "dispatched"
  | "partial_failure"
  | "received"
  | "running";

export type OrchestratorTarget = {
  agentId: string;
  agentName: string;
  provider: ProviderId;
};

export type OrchestratorResult = OrchestratorTarget & {
  finalContent: string;
};

export type OrchestratorState = {
  conversationId: string;
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

export function toOrchestratorStatusEvent(
  status: OrchestratorStatus
): StreamEvent {
  return {
    kind: "conversation.status",
    payload: {
      label: `orchestrator.${status}`,
      state:
        status === "aggregated"
          ? "succeeded"
          : status === "partial_failure"
            ? "failed"
            : "running"
    }
  };
}
