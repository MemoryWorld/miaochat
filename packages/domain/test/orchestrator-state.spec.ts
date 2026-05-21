import { describe, expect, it } from "vitest";

import {
  advanceOrchestratorState,
  createOrchestratorState,
  recordOrchestratorResults,
  toOrchestratorStatusEvent
} from "../src/orchestration/orchestrator-state.js";

describe("orchestratorState", () => {
  it("tracks state transitions and normalizes status events", () => {
    const receivedState = createOrchestratorState({
      conversationId: "conv_group_1",
      message: "Plan the release",
      targets: [
        {
          agentId: "agent_hermes",
          agentName: "Hermes Planner",
          provider: "mock"
        }
      ],
      workspaceId: "workspace_group_1"
    });
    const dispatchedState = advanceOrchestratorState(receivedState, "dispatched");
    const runningState = advanceOrchestratorState(dispatchedState, "running");
    const completedState = recordOrchestratorResults(runningState, [
      {
        agentId: "agent_hermes",
        agentName: "Hermes Planner",
        finalContent: "[mock-group:agent_hermes] Plan the release",
        provider: "mock"
      }
    ]);

    expect(completedState.statusHistory).toEqual([
      "received",
      "dispatched",
      "running"
    ]);
    expect(toOrchestratorStatusEvent("running")).toEqual({
      kind: "conversation.status",
      payload: {
        label: "orchestrator.running",
        state: "running"
      }
    });
    expect(toOrchestratorStatusEvent("aggregated")).toEqual({
      kind: "conversation.status",
      payload: {
        label: "orchestrator.aggregated",
        state: "succeeded"
      }
    });
    expect(completedState.results).toEqual([
      {
        agentId: "agent_hermes",
        agentName: "Hermes Planner",
        finalContent: "[mock-group:agent_hermes] Plan the release",
        provider: "mock"
      }
    ]);
  });
});
