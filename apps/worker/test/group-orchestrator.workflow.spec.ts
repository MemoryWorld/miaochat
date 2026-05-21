import { describe, expect, it } from "vitest";

import { groupOrchestratorWorkflow } from "../src/workflows/group-orchestrator.workflow.js";

describe("groupOrchestratorWorkflow", () => {
  it("dispatches the selected agents, tracks orchestrator states, and aggregates one reply", async () => {
    const result = await groupOrchestratorWorkflow({
      conversationId: "conv_group_1",
      message: "Plan the next release slice",
      targets: [
        {
          agentId: "agent_hermes",
          agentName: "Hermes Planner",
          provider: "mock"
        },
        {
          agentId: "agent_codex",
          agentName: "Codex Builder",
          provider: "mock"
        }
      ],
      workspaceId: "workspace_group_1"
    });

    expect(result.finalContent).toBe(
      [
        "[Hermes Planner]",
        "[mock-group:agent_hermes] Plan the next release slice",
        "",
        "[Codex Builder]",
        "[mock-group:agent_codex] Plan the next release slice"
      ].join("\n")
    );
    expect(result.state.statusHistory).toEqual([
      "received",
      "dispatched",
      "running",
      "aggregated"
    ]);
    expect(result.state.results).toEqual([
      {
        agentId: "agent_hermes",
        agentName: "Hermes Planner",
        finalContent: "[mock-group:agent_hermes] Plan the next release slice",
        provider: "mock"
      },
      {
        agentId: "agent_codex",
        agentName: "Codex Builder",
        finalContent: "[mock-group:agent_codex] Plan the next release slice",
        provider: "mock"
      }
    ]);
    expect(
      result.streamEvents
        .filter((event) => event.kind === "conversation.status")
        .map((event) => event.payload.label)
    ).toEqual([
      "orchestrator.received",
      "orchestrator.dispatched",
      "orchestrator.running",
      "orchestrator.aggregated"
    ]);
  });
});
