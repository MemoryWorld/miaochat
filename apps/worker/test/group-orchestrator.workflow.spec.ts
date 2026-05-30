import { beforeEach, describe, expect, it, vi } from "vitest";

const { proxyActivitiesMock } = vi.hoisted(() => ({
  proxyActivitiesMock: vi.fn()
}));

vi.mock("@temporalio/workflow", () => ({
  proxyActivities: proxyActivitiesMock
}));

describe("groupOrchestratorWorkflow", () => {
  beforeEach(() => {
    proxyActivitiesMock.mockReset();
    vi.resetModules();
  });

  it("dispatches the selected agents, tracks orchestrator states, and aggregates one reply", async () => {
    proxyActivitiesMock
      .mockReturnValueOnce({
        aggregateResultsActivity: async (input: {
          results: Array<{ agentName: string; finalContent: string }>;
        }) =>
          input.results
            .map((result) => `[${result.agentName}]\n${result.finalContent}`)
            .join("\n\n")
      })
      .mockReturnValueOnce({
        dispatchAgentActivity: async (input: {
          agentId: string;
          agentName: string;
          message: string;
          provider: "mock";
        }) => ({
          agentId: input.agentId,
          agentName: input.agentName,
          finalContent: `[mock-group:${input.agentId}] ${input.message}`,
          provider: input.provider
        })
      });

    const { groupOrchestratorWorkflow } = await import(
      "../src/workflows/group-orchestrator.workflow.js"
    );
    expect(proxyActivitiesMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        retry: expect.objectContaining({
          maximumAttempts: 5,
          nonRetryableErrorTypes: expect.arrayContaining([
            "ProviderCredentialError"
          ])
        }),
        startToCloseTimeout: "5 minutes"
      })
    );
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

  it("downgrades to partial failure when one target fails and another times out", async () => {
    proxyActivitiesMock
      .mockReturnValueOnce({
        aggregateResultsActivity: async (input: {
          results: Array<{ agentName: string; finalContent: string }>;
        }) =>
          input.results
            .map((result) => `[${result.agentName}]\n${result.finalContent}`)
            .join("\n\n")
      })
      .mockReturnValueOnce({
        dispatchAgentActivity: async (input: {
          agentId: string;
          agentName: string;
          message: string;
          provider: "mock";
        }) => {
          if (input.agentId === "agent_failure") {
            throw new Error("Mock dispatch failed before completion for Failure Scout.");
          }

          if (input.agentId === "agent_timeout") {
            throw new Error("Mock dispatch timed out before completion for Timeout Watcher.");
          }

          return {
            agentId: input.agentId,
            agentName: input.agentName,
            finalContent: `[mock-group:${input.agentId}] ${input.message}`,
            provider: input.provider
          };
        }
      });

    const { groupOrchestratorWorkflow } = await import(
      "../src/workflows/group-orchestrator.workflow.js"
    );
    const result = await groupOrchestratorWorkflow({
      conversationId: "conv_group_failure",
      message: "Plan the rollback path",
      targets: [
        {
          agentId: "agent_hermes",
          agentName: "Hermes Planner",
          provider: "mock"
        },
        {
          agentId: "agent_failure",
          agentName: "Failure Scout",
          provider: "mock"
        },
        {
          agentId: "agent_timeout",
          agentName: "Timeout Watcher",
          provider: "mock"
        }
      ],
      workspaceId: "workspace_group_failure"
    });

    expect(result.finalContent).toContain("[Hermes Planner]");
    expect(result.finalContent).toContain("[mock-group:agent_hermes] Plan the rollback path");
    expect(result.finalContent).toContain("Partial failure");
    expect(result.finalContent).toContain("Failure Scout");
    expect(result.finalContent).toContain("Timeout Watcher");
    expect(result.state.statusHistory).toEqual([
      "received",
      "dispatched",
      "running",
      "partial_failure",
      "aggregated"
    ]);
    expect(result.state.results).toEqual([
      {
        agentId: "agent_hermes",
        agentName: "Hermes Planner",
        finalContent: "[mock-group:agent_hermes] Plan the rollback path",
        provider: "mock"
      }
    ]);
    expect(result.state.failures).toEqual([
      {
        agentId: "agent_failure",
        agentName: "Failure Scout",
        code: "error",
        detail: expect.stringContaining("failed"),
        provider: "mock"
      },
      {
        agentId: "agent_timeout",
        agentName: "Timeout Watcher",
        code: "timeout",
        detail: expect.stringContaining("timed out"),
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
      "orchestrator.partial_failure",
      "orchestrator.aggregated"
    ]);

    const partialFailureEvent = result.streamEvents.find(
      (event) =>
        event.kind === "conversation.status" &&
        event.payload.label === "orchestrator.partial_failure"
    );

    expect(partialFailureEvent).toMatchObject({
      kind: "conversation.status",
      payload: {
        failures: [
          expect.objectContaining({
            agentId: "agent_failure",
            code: "error"
          }),
          expect.objectContaining({
            agentId: "agent_timeout",
            code: "timeout"
          })
        ],
        state: "failed",
        successfulAgentCount: 1,
        summary: expect.stringContaining("2 of 3"),
        totalAgentCount: 3
      }
    });
  });
});
