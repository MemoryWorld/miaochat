import { describe, expect, it } from "vitest";

import {
  advanceOrchestratorState,
  createOrchestratorState,
  recordOrchestratorFailures,
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
    expect(toOrchestratorStatusEvent(runningState)).toEqual({
      kind: "conversation.status",
      payload: {
        failures: [],
        label: "orchestrator.running",
        state: "running",
        successfulAgentCount: 0,
        summary: "Waiting for 1 agent results.",
        totalAgentCount: 1
      }
    });
    const partialFailureState = advanceOrchestratorState(
      recordOrchestratorFailures(runningState, [
        {
          agentId: "agent_timeout",
          agentName: "Timeout Watcher",
          code: "timeout",
          detail: "Mock dispatch timed out before completion.",
          provider: "mock"
        }
      ]),
      "partial_failure"
    );

    expect(toOrchestratorStatusEvent(partialFailureState)).toEqual({
      kind: "conversation.status",
      payload: {
        failures: [
          {
            agentId: "agent_timeout",
            agentName: "Timeout Watcher",
            code: "timeout",
            detail: "Mock dispatch timed out before completion.",
            provider: "mock"
          }
        ],
        label: "orchestrator.partial_failure",
        state: "failed",
        successfulAgentCount: 0,
        summary: "1 of 1 agents failed or timed out. No successful results remain.",
        totalAgentCount: 1
      }
    });

    const aggregatedState = advanceOrchestratorState(completedState, "aggregated");

    expect(toOrchestratorStatusEvent(aggregatedState)).toEqual({
      kind: "conversation.status",
      payload: {
        failures: [],
        label: "orchestrator.aggregated",
        state: "succeeded",
        successfulAgentCount: 1,
        summary: "Aggregated 1 of 1 agent results.",
        totalAgentCount: 1
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
