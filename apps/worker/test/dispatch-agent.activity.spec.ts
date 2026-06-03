import { beforeEach, describe, expect, it, vi } from "vitest";

const { createPhaseARuntimeExecutionMock } = vi.hoisted(() => ({
  createPhaseARuntimeExecutionMock: vi.fn()
}));

vi.mock("../src/activities/provider-runtime.js", () => ({
  createPhaseARuntimeExecution: createPhaseARuntimeExecutionMock
}));

vi.mock("../src/observability/observability.js", () => ({
  getWorkerLogger: () => ({
    error: vi.fn()
  }),
  getWorkerMetrics: () => ({
    incrementCounter: vi.fn()
  }),
  getWorkerTracer: () => ({
    startSpan: () => ({
      end: vi.fn(),
      fail: vi.fn()
    })
  })
}));

describe("dispatchAgentActivity", () => {
  beforeEach(() => {
    createPhaseARuntimeExecutionMock.mockReset();
    vi.resetModules();
  });

  it("keeps internal collaboration control JSON out of visible final content", async () => {
    const visibleMarkdown = [
      "## 技术方案",
      "",
      "| 模块 | 处理 |",
      "| --- | --- |",
      "| 交互层 | 保留用户可见说明 |",
      "",
      "下一步会继续拆分实现任务。"
    ].join("\n");
    const dirtyContent = `${visibleMarkdown}
[{"type":"handoff_request","targetRoleKey":"builder","targetAgentId":"agent_builder","goal":"安排实现同事继续","acceptanceCriteria":["完成测试"],"constraints":["保持用户可配置"]},{"type":"handoff_request","targetRoleKey":"reviewer","goal":"安排复核","acceptanceCriteria":["完成复核"],"constraints":["不要改变用户可见正文"]}]`;
    const execute = vi.fn(async () => ({
      finalContent: dirtyContent,
      streamEvents: []
    }));

    createPhaseARuntimeExecutionMock.mockResolvedValue({
      adapter: {
        execute,
        provider: "mock"
      },
      provider: "mock"
    });

    const { dispatchAgentActivity } = await import(
      "../src/activities/dispatch-agent.activity.js"
    );
    const result = await dispatchAgentActivity({
      agentId: "agent_planner",
      agentName: "Planner",
      conversationId: "conv_group",
      message: "请协作推进这个目标",
      ownerUserId: "user_owner",
      provider: "mock",
      workspaceId: "workspace_1"
    });

    expect(result.finalContent).toBe(visibleMarkdown);
    expect(result.finalContent).not.toContain("handoff_request");
    expect(result.finalContent).not.toContain("targetRoleKey");
    expect(result.finalContent).not.toContain("acceptanceCriteria");
  });

  it("includes collaboration step instructions and prior output in the agent task prompt", async () => {
    const execute = vi.fn(async () => ({
      finalContent: "基于上一位输出补齐风险、验收清单和落地任务。",
      streamEvents: []
    }));

    createPhaseARuntimeExecutionMock.mockResolvedValue({
      adapter: {
        execute,
        provider: "mock"
      },
      provider: "mock"
    });

    const { dispatchAgentActivity } = await import(
      "../src/activities/dispatch-agent.activity.js"
    );
    await dispatchAgentActivity({
      agentId: "agent_engineer",
      agentName: "软件工程师",
      collaborationStep: {
        currentRequirement:
          "基于上一位 AI 同事的输出继续推进，补充风险、验收清单和落地任务，避免重复上一位内容。",
        previousOutput:
          "MVP 范围：导入人体扫描数据、生成护具参数、输出 3D 打印调校建议。",
        stepNumber: 2
      },
      conversationId: "conv_group",
      message: "连续进行两轮协作",
      ownerUserId: "user_owner",
      provider: "mock",
      workspaceId: "workspace_1"
    });

    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({
        instructions: expect.stringContaining("协作步骤：第 2 步")
      })
    );
    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({
        instructions: expect.stringContaining("MVP 范围：导入人体扫描数据")
      })
    );
    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({
        instructions: expect.stringContaining("避免重复上一位内容")
      })
    );
  });

  it("removes visible transfer placeholders and internal control words from agent output", async () => {
    const execute = vi.fn(async () => ({
      finalContent:
        "我将请另一位同事先梳理方案，稍后我会基于这些内容补充风险。 ORCHESTRATOR metadata handoff target",
      streamEvents: []
    }));

    createPhaseARuntimeExecutionMock.mockResolvedValue({
      adapter: {
        execute,
        provider: "mock"
      },
      provider: "mock"
    });

    const { dispatchAgentActivity } = await import(
      "../src/activities/dispatch-agent.activity.js"
    );
    const result = await dispatchAgentActivity({
      agentId: "agent_engineer",
      agentName: "软件工程师",
      conversationId: "conv_group",
      message: "请两位同事接力协作",
      ownerUserId: "user_owner",
      provider: "mock",
      workspaceId: "workspace_1"
    });

    expect(result.finalContent).not.toContain("我将请");
    expect(result.finalContent).not.toContain("稍后");
    expect(result.finalContent).not.toContain("ORCHESTRATOR");
    expect(result.finalContent).not.toContain("metadata");
    expect(result.finalContent).not.toContain("handoff");
    expect(result.finalContent).not.toContain("target");
  });
});
