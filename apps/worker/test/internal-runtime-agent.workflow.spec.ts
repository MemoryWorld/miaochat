import { beforeEach, describe, expect, it, vi } from "vitest";

const { proxyActivitiesMock, workflowInfoMock } = vi.hoisted(() => ({
  proxyActivitiesMock: vi.fn(),
  workflowInfoMock: vi.fn()
}));

vi.mock("@temporalio/workflow", () => ({
  proxyActivities: proxyActivitiesMock,
  workflowInfo: workflowInfoMock
}));

describe("internalRuntimeAgentWorkflow", () => {
  beforeEach(() => {
    proxyActivitiesMock.mockReset();
    workflowInfoMock.mockReset();
    workflowInfoMock.mockReturnValue({
      workflowId: "coding-workflow-stage:conv_1:agent_1:run_1"
    });
    vi.resetModules();
  });

  it("passes a state-aware harness run id into the internal runtime activity", async () => {
    const executeInternalRuntimeAgentActivity = vi.fn(async () => ({
      finalContent: "ok",
      streamEvents: []
    }));

    proxyActivitiesMock.mockReturnValueOnce({
      executeInternalRuntimeAgentActivity
    });

    const { internalRuntimeAgentWorkflow } = await import(
      "../src/workflows/internal-runtime-agent.workflow.js"
    );

    await expect(
      internalRuntimeAgentWorkflow({
        agentId: "agent_1",
        agentName: "软件工程师",
        conversationId: "conv_1",
        message: "execute the approved plan",
        ownerUserId: "user_1",
        runtimeBackend: "enhanced-hermes",
        workspaceId: "workspace_1"
      })
    ).resolves.toEqual({
      finalContent: "ok",
      streamEvents: []
    });

    expect(executeInternalRuntimeAgentActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        agentName: "软件工程师",
        harnessRunId: "coding-workflow-stage:conv_1:agent_1:run_1"
      })
    );
  });
});
