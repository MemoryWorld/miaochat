import { beforeEach, describe, expect, it, vi } from "vitest";

const { proxyActivitiesMock, workflowInfoMock } = vi.hoisted(() => ({
  proxyActivitiesMock: vi.fn(),
  workflowInfoMock: vi.fn()
}));

vi.mock("@temporalio/workflow", () => ({
  proxyActivities: proxyActivitiesMock,
  workflowInfo: workflowInfoMock
}));

describe("groupOrchestratorWorkflow", () => {
  beforeEach(() => {
    proxyActivitiesMock.mockReset();
    workflowInfoMock.mockReset();
    workflowInfoMock.mockReturnValue({
      workflowId: "group-orchestrator:conv_group_1:run_1"
    });
    vi.resetModules();
  });

  it("dispatches planned agents for two default collaboration rounds", async () => {
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
          harnessRunId: string;
          message: string;
          provider: "mock";
          systemPrompt?: string | null;
        }) => {
          if (input.agentId === "agent_planner" && input.harnessRunId.includes(":r0:")) {
            expect(input.systemPrompt).toBe("先提交计划再进入执行。");
            expect(input.harnessRunId).toBe(
              "group-orchestrator:conv_group_1:run_1:r0:t0:agent_planner"
            );
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
          agentId: "agent_planner",
          agentName: "Planner",
          provider: "mock",
          systemPrompt: "先提交计划再进入执行。"
        },
        {
          agentId: "agent_builder",
          agentName: "Builder",
          provider: "mock"
        }
      ],
      workspaceId: "workspace_group_1"
    });

    expect(result.finalContent).toBe(
      [
        "[Planner]",
        "[mock-group:agent_planner] Plan the next release slice",
        "",
        "[Builder]",
        "[mock-group:agent_builder] Plan the next release slice",
        "",
        "[Planner]",
        "[mock-group:agent_planner] Plan the next release slice",
        "",
        "[Builder]",
        "[mock-group:agent_builder] Plan the next release slice"
      ].join("\n")
    );
    expect(result.state.statusHistory).toEqual([
      "received",
      "dispatched",
      "running",
      "aggregated"
    ]);
    expect(result.state.results.map((entry) => ({
      agentId: entry.agentId,
      roundIndex: entry.roundIndex,
      turnIndex: entry.turnIndex
    }))).toEqual([
      { agentId: "agent_planner", roundIndex: 0, turnIndex: 0 },
      { agentId: "agent_builder", roundIndex: 0, turnIndex: 1 },
      { agentId: "agent_planner", roundIndex: 1, turnIndex: 2 },
      { agentId: "agent_builder", roundIndex: 1, turnIndex: 3 }
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

  it("passes prior teammate outputs into later initial target dispatches", async () => {
    const dispatchCalls: Array<{
      agentId: string;
      collaborationStep?: {
        currentRequirement: string;
        previousOutput?: string;
        stepNumber: number;
      };
      context?: {
        pinnedMessages?: Array<{ content: string; id: string; role: string }>;
      };
    }> = [];

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
          collaborationStep?: {
            currentRequirement: string;
            previousOutput?: string;
            stepNumber: number;
          };
          context?: {
            pinnedMessages?: Array<{ content: string; id: string; role: string }>;
          };
          message: string;
          provider: "mock";
        }) => {
          dispatchCalls.push(input);

          return {
            agentId: input.agentId,
            agentName: input.agentName,
            finalContent: `${input.agentName} completed ${input.message}`,
            provider: input.provider
          };
        }
      });

    const { groupOrchestratorWorkflow } = await import(
      "../src/workflows/group-orchestrator.workflow.js"
    );
    const result = await groupOrchestratorWorkflow({
      context: {
        pinnedMessages: [
          {
            content: "Existing pinned channel context",
            id: "pin:existing",
            role: "user"
          }
        ]
      },
      conversationId: "conv_group_peer_context",
      initialTargetAgentIds: [
        "agent_planner",
        "agent_executor",
        "agent_reviewer"
      ],
      message: "Create a practical delivery plan",
      targets: [
        {
          agentId: "agent_planner",
          agentName: "Planner",
          provider: "mock"
        },
        {
          agentId: "agent_executor",
          agentName: "Executor",
          provider: "mock"
        },
        {
          agentId: "agent_reviewer",
          agentName: "Reviewer",
          provider: "mock"
        }
      ],
      workspaceId: "workspace_group_peer_context"
    });

    expect(dispatchCalls.map((call) => call.agentId)).toEqual([
      "agent_planner",
      "agent_executor",
      "agent_reviewer",
      "agent_planner",
      "agent_executor",
      "agent_reviewer"
    ]);
    expect(dispatchCalls.map((call) => call.collaborationStep?.stepNumber)).toEqual([
      1,
      2,
      3,
      4,
      5,
      6
    ]);
    expect(dispatchCalls[0]?.collaborationStep?.currentRequirement).toContain(
      "给出本步实质交付"
    );
    expect(dispatchCalls[1]?.collaborationStep?.previousOutput).toContain(
      "Planner completed Create a practical delivery plan"
    );
    expect(dispatchCalls[1]?.collaborationStep?.currentRequirement).toContain(
      "基于上一位 AI 同事的输出继续推进"
    );
    expect(dispatchCalls[3]?.collaborationStep?.previousOutput).toContain(
      "Reviewer completed Create a practical delivery plan"
    );
    expect(dispatchCalls[3]?.collaborationStep?.currentRequirement).toContain(
      "收敛"
    );
    expect(dispatchCalls[0]?.context?.pinnedMessages).toEqual([
      {
        content: "Existing pinned channel context",
        id: "pin:existing",
        role: "user"
      }
    ]);
    expect(dispatchCalls[1]?.context?.pinnedMessages).toEqual([
      {
        content: "Existing pinned channel context",
        id: "pin:existing",
        role: "user"
      },
      expect.objectContaining({
        content: expect.stringContaining("Planner completed"),
        id: "peer:agent_planner",
        role: "assistant"
      })
    ]);
    expect(dispatchCalls[2]?.context?.pinnedMessages).toEqual([
      {
        content: "Existing pinned channel context",
        id: "pin:existing",
        role: "user"
      },
      expect.objectContaining({
        content: expect.stringContaining("Planner completed"),
        id: "peer:agent_planner",
        role: "assistant"
      }),
      expect.objectContaining({
        content: expect.stringContaining("Executor completed"),
        id: "peer:agent_executor",
        role: "assistant"
      })
    ]);
    expect(dispatchCalls[3]?.context?.pinnedMessages).toEqual([
      {
        content: "Existing pinned channel context",
        id: "pin:existing",
        role: "user"
      },
      expect.objectContaining({
        content: expect.stringContaining("Planner completed"),
        id: "peer:agent_planner",
        role: "assistant"
      }),
      expect.objectContaining({
        content: expect.stringContaining("Executor completed"),
        id: "peer:agent_executor",
        role: "assistant"
      }),
      expect.objectContaining({
        content: expect.stringContaining("Reviewer completed"),
        id: "peer:agent_reviewer",
        role: "assistant"
      })
    ]);
    expect(dispatchCalls[4]?.context?.pinnedMessages).toEqual([
      expect.objectContaining({
        content: "Existing pinned channel context",
        id: "pin:existing",
        role: "user"
      }),
      expect.objectContaining({
        content: expect.stringContaining("Planner completed")
      }),
      expect.objectContaining({
        content: expect.stringContaining("Executor completed")
      }),
      expect.objectContaining({
        content: expect.stringContaining("Reviewer completed")
      }),
      expect.objectContaining({
        content: expect.stringContaining("Planner completed")
      })
    ]);
    expect(result.state.results.map((entry) => entry.agentId)).toEqual([
      "agent_planner",
      "agent_executor",
      "agent_reviewer",
      "agent_planner",
      "agent_executor",
      "agent_reviewer"
    ]);
    expect(result.state.results.map((entry) => entry.roundIndex)).toEqual([
      0,
      0,
      0,
      1,
      1,
      1
    ]);
  });

  it("limits explicit two-step relay requests to two visible dispatches", async () => {
    const dispatchCalls: Array<{
      agentId: string;
      collaborationStep?: {
        previousOutput?: string;
        stepNumber: number;
        totalPlannedSteps: number;
      };
    }> = [];

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
          collaborationStep?: {
            previousOutput?: string;
            stepNumber: number;
            totalPlannedSteps: number;
          };
          message: string;
          provider: "mock";
        }) => {
          dispatchCalls.push(input);

          return {
            agentId: input.agentId,
            agentName: input.agentName,
            finalContent: `${input.agentName} completed step ${input.collaborationStep?.stepNumber}`,
            provider: input.provider
          };
        }
      });

    const { groupOrchestratorWorkflow } = await import(
      "../src/workflows/group-orchestrator.workflow.js"
    );
    const result = await groupOrchestratorWorkflow({
      conversationId: "conv_group_two_step_relay",
      message: "请 Alpha 和 Beta 两步接力完成方案。",
      targets: [
        {
          agentId: "agent_alpha",
          agentName: "Alpha",
          provider: "mock"
        },
        {
          agentId: "agent_beta",
          agentName: "Beta",
          provider: "mock"
        }
      ],
      workspaceId: "workspace_group_two_step_relay"
    });

    expect(dispatchCalls.map((call) => call.agentId)).toEqual([
      "agent_alpha",
      "agent_beta"
    ]);
    expect(dispatchCalls.map((call) => call.collaborationStep?.stepNumber)).toEqual([
      1,
      2
    ]);
    expect(
      dispatchCalls.map((call) => call.collaborationStep?.totalPlannedSteps)
    ).toEqual([2, 2]);
    expect(dispatchCalls[1]?.collaborationStep?.previousOutput).toContain(
      "Alpha completed step 1"
    );
    expect(result.state.results.map((entry) => ({
      agentId: entry.agentId,
      roundIndex: entry.roundIndex,
      turnIndex: entry.turnIndex
    }))).toEqual([
      { agentId: "agent_alpha", roundIndex: 0, turnIndex: 0 },
      { agentId: "agent_beta", roundIndex: 0, turnIndex: 1 }
    ]);
  });

  it("uses capability handoff declarations to feed earlier results into dependent agents", async () => {
    const dispatchCalls: Array<{
      agentId: string;
      context?: {
        pinnedMessages?: Array<{ content: string; id: string; role: string }>;
      };
    }> = [];

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
          context?: {
            pinnedMessages?: Array<{ content: string; id: string; role: string }>;
          };
          message: string;
          provider: "mock";
        }) => {
          dispatchCalls.push(input);

          if (input.agentId === "agent_planner") {
            return {
              agentId: input.agentId,
              agentName: input.agentName,
              finalContent: "HANDOFF_FOR_SOFTWARE_ENGINEER: build the vertical slice.",
              provider: input.provider
            };
          }

          expect(input.context?.pinnedMessages?.at(-1)).toMatchObject({
            content: expect.stringContaining(
              "HANDOFF_FOR_SOFTWARE_ENGINEER: build the vertical slice."
            ),
            id: "handoff:agent_planner",
            role: "assistant"
          });

          return {
            agentId: input.agentId,
            agentName: input.agentName,
            finalContent: "Implementation started from handoff.",
            provider: input.provider
          };
        }
      });

    const { groupOrchestratorWorkflow } = await import(
      "../src/workflows/group-orchestrator.workflow.js"
    );
    const result = await groupOrchestratorWorkflow({
      conversationId: "conv_group_handoff",
      message: "Build the AR prototype",
      targets: [
        {
          agentId: "agent_builder",
          agentName: "Builder",
          capabilityTags: ["consumes:technical_handoff"],
          provider: "mock"
        },
        {
          agentId: "agent_planner",
          agentName: "Planner",
          capabilityTags: ["produces:technical_handoff"],
          provider: "mock"
        }
      ],
      workspaceId: "workspace_group_handoff"
    });

    expect(dispatchCalls.map((call) => call.agentId)).toEqual([
      "agent_planner",
      "agent_builder",
      "agent_planner",
      "agent_builder"
    ]);
    expect(result.finalContent).toContain("[Planner]");
    expect(result.finalContent).toContain("[Builder]");
    expect(result.state.results.map((entry) => entry.agentId)).toEqual([
      "agent_planner",
      "agent_builder",
      "agent_planner",
      "agent_builder"
    ]);
  });

  it("starts from initial target ids and continues only through typed handoff intents", async () => {
    const dispatchCalls: string[] = [];

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
          dispatchCalls.push(input.agentId);

          if (input.agentId === "agent_tech_lead") {
            return {
              agentId: input.agentId,
              agentName: input.agentName,
              capabilityTags: ["channel:coordinator", "produces:technical_handoff"],
              finalContent: "我会把实现交接给工程同事。",
              harnessOutput: {
                intents: [
                  {
                    acceptanceCriteria: ["Engineer turn queued"],
                    constraints: ["不要硬编码 AI 同事行为"],
                    goal: "Build the implementation",
                    targetRoleKey: "software-engineer",
                    type: "handoff_request"
                  }
                ],
                visibleMessage: "我会把实现交接给工程同事。"
              },
              provider: input.provider
            };
          }

          return {
            agentId: input.agentId,
            agentName: input.agentName,
            capabilityTags: ["role:software-engineer", "consumes:technical_handoff"],
            finalContent: "实现同事收到 typed handoff，开始落地。",
            provider: input.provider
          };
        }
      });

    const { groupOrchestratorWorkflow } = await import(
      "../src/workflows/group-orchestrator.workflow.js"
    );
    const result = await groupOrchestratorWorkflow({
      conversationId: "conv_group_typed_handoff",
      initialTargetAgentIds: ["agent_tech_lead"],
      message: "Build the AR prototype",
      targets: [
        {
          agentId: "agent_engineer",
          agentName: "Engineer",
          capabilityTags: ["role:software-engineer", "consumes:technical_handoff"],
          provider: "mock"
        },
        {
          agentId: "agent_tech_lead",
          agentName: "Tech Lead",
          capabilityTags: ["channel:coordinator", "produces:technical_handoff"],
          provider: "mock"
        }
      ],
      workspaceId: "workspace_group_typed_handoff"
    });

    expect(dispatchCalls).toEqual(["agent_tech_lead", "agent_engineer"]);
    expect(result.finalContent).toContain("[Tech Lead]");
    expect(result.finalContent).toContain("[Engineer]");
    expect(result.state.targets.map((target) => target.agentId)).toEqual([
      "agent_tech_lead",
      "agent_engineer"
    ]);
    expect(result.state.results.map((entry) => entry.agentId)).toEqual([
      "agent_tech_lead",
      "agent_engineer"
    ]);
  });

  it("does not follow handoffs when initial targets came from explicit human mentions", async () => {
    const dispatchCalls: string[] = [];

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
          provider: "mock";
        }) => {
          dispatchCalls.push(input.agentId);

          return {
            agentId: input.agentId,
            agentName: input.agentName,
            finalContent: "我会把实现交接给工程同事。",
            harnessOutput: {
              intents: [
                {
                  acceptanceCriteria: ["Engineer turn queued"],
                  constraints: [],
                  goal: "Build the implementation",
                  targetRoleKey: "software-engineer",
                  type: "handoff_request"
                }
              ],
              visibleMessage: "我会把实现交接给工程同事。"
            },
            provider: input.provider
          };
        }
      });

    const { groupOrchestratorWorkflow } = await import(
      "../src/workflows/group-orchestrator.workflow.js"
    );
    const result = await groupOrchestratorWorkflow({
      conversationId: "conv_group_explicit_mention",
      initialTargetAgentIds: ["agent_planner"],
      lockInitialTargets: true,
      message: "@方案规划同事 回归测试",
      targets: [
        {
          agentId: "agent_engineer",
          agentName: "Engineer",
          capabilityTags: ["role:software-engineer"],
          provider: "mock"
        },
        {
          agentId: "agent_planner",
          agentName: "Planner",
          capabilityTags: ["role:planning"],
          provider: "mock"
        }
      ],
      workspaceId: "workspace_group_explicit_mention"
    });

    expect(dispatchCalls).toEqual(["agent_planner"]);
    expect(result.state.targets.map((target) => target.agentId)).toEqual([
      "agent_planner"
    ]);
    expect(result.state.results.map((entry) => entry.agentId)).toEqual([
      "agent_planner"
    ]);
    expect(result.finalContent).toContain("[Planner]");
    expect(result.finalContent).not.toContain("[Engineer]");
  });

  it("fails fast when initial target ids cannot be resolved", async () => {
    proxyActivitiesMock
      .mockReturnValueOnce({
        aggregateResultsActivity: async () => ""
      })
      .mockReturnValueOnce({
        dispatchAgentActivity: async () => {
          throw new Error("dispatch should not run");
        }
      });

    const { groupOrchestratorWorkflow } = await import(
      "../src/workflows/group-orchestrator.workflow.js"
    );

    await expect(
      groupOrchestratorWorkflow({
        conversationId: "conv_group_invalid_initial",
        initialTargetAgentIds: ["missing_agent"],
        message: "Build the AR prototype",
        targets: [
          {
            agentId: "agent_tech_lead",
            agentName: "Tech Lead",
            capabilityTags: ["channel:coordinator"],
            provider: "mock"
          }
        ],
        workspaceId: "workspace_group_invalid_initial"
      })
    ).rejects.toThrow(
      "The orchestrator requires at least one resolvable initial target agent."
    );
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
          harnessRunId: string;
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
      maxRounds: 1,
      message: "Plan the rollback path",
      targets: [
        {
          agentId: "agent_success",
          agentName: "Success Planner",
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

    expect(result.finalContent).toContain("[Success Planner]");
    expect(result.finalContent).toContain("[mock-group:agent_success] Plan the rollback path");
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
      expect.objectContaining({
        agentId: "agent_success",
        agentName: "Success Planner",
        finalContent: "[mock-group:agent_success] Plan the rollback path",
        provider: "mock",
        roundIndex: 0,
        turnIndex: 0
      })
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
