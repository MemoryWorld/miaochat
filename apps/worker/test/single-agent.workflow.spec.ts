import { beforeEach, describe, expect, it, vi } from "vitest";

const { proxyActivitiesMock, workflowInfoMock } = vi.hoisted(() => ({
  proxyActivitiesMock: vi.fn(),
  workflowInfoMock: vi.fn()
}));

vi.mock("@temporalio/workflow", () => ({
  proxyActivities: proxyActivitiesMock,
  workflowInfo: workflowInfoMock
}));

describe("singleAgentWorkflow", () => {
  beforeEach(() => {
    proxyActivitiesMock.mockReset();
    workflowInfoMock.mockReset();
    workflowInfoMock.mockReturnValue({ workflowId: "single-agent:conv_1:run_1" });
    vi.resetModules();
  });

  it("allows real model streaming to run longer than one minute without infinite credential retries", async () => {
    const executeDirectAgentActivity = vi.fn(async () => ({
      finalContent: "ok",
      streamEvents: []
    }));

    proxyActivitiesMock.mockReturnValueOnce({
      executeDirectAgentActivity
    });

    const { singleAgentWorkflow } = await import(
      "../src/workflows/single-agent.workflow.js"
    );

    expect(proxyActivitiesMock).toHaveBeenCalledWith(
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

    await expect(
      singleAgentWorkflow({
        agentId: "agent_1",
        agentName: "软件工程师",
        conversationId: "conv_1",
        message: "hello",
        ownerUserId: "user_1",
        systemPrompt: "负责实现和测试。",
        provider: "deepseek",
        workspaceId: "workspace_1"
      })
    ).resolves.toEqual({
      finalContent: "ok",
      streamEvents: []
    });
    expect(executeDirectAgentActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        agentName: "软件工程师",
        harnessRunId: "single-agent:conv_1:run_1",
        systemPrompt: "负责实现和测试。"
      })
    );
  });
});
