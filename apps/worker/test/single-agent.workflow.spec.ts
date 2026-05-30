import { beforeEach, describe, expect, it, vi } from "vitest";

const { proxyActivitiesMock } = vi.hoisted(() => ({
  proxyActivitiesMock: vi.fn()
}));

vi.mock("@temporalio/workflow", () => ({
  proxyActivities: proxyActivitiesMock
}));

describe("singleAgentWorkflow", () => {
  beforeEach(() => {
    proxyActivitiesMock.mockReset();
    vi.resetModules();
  });

  it("allows real model streaming to run longer than one minute without infinite credential retries", async () => {
    proxyActivitiesMock.mockReturnValueOnce({
      executeDirectAgentActivity: async () => ({
        finalContent: "ok",
        streamEvents: []
      })
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
        conversationId: "conv_1",
        message: "hello",
        ownerUserId: "user_1",
        provider: "deepseek",
        workspaceId: "workspace_1"
      })
    ).resolves.toEqual({
      finalContent: "ok",
      streamEvents: []
    });
  });
});
