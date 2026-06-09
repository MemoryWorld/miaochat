import { createMessageLifecycleEvents } from "@agenthub/agent-sdk";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { createInternalRuntimeExecutionMock } = vi.hoisted(() => ({
  createInternalRuntimeExecutionMock: vi.fn()
}));

vi.mock("../src/activities/internal-runtime-registry.js", () => ({
  createInternalRuntimeExecution: createInternalRuntimeExecutionMock
}));

describe("executeInternalRuntimeAgentActivity", () => {
  beforeEach(() => {
    createInternalRuntimeExecutionMock.mockReset();
    vi.resetModules();
  });

  it("returns sanitized content, clean stream events, and extracted Markdown drafts for artifact envelopes", async () => {
    const rawEnvelope = JSON.stringify({
      intents: [
        {
          calls: [
            {
              idempotencyKey: "artifact:acceptance-report",
              input: {
                fileName: "acceptance-report.md",
                markdown: "# 验收报告\n\n通过。",
                title: "验收报告"
              },
              inputSchemaVersion: "1",
              toolName: "artifact.markdown.create"
            }
          ],
          riskLevel: "low",
          summary: "Create acceptance report.",
          type: "tool_plan"
        }
      ],
      visibleMessage: "已生成可下载 Markdown 验收报告。"
    });
    const execute = vi.fn(async () => ({
      finalContent: rawEnvelope,
      streamEvents: createMessageLifecycleEvents({
        finalContent: rawEnvelope,
        messageId: "raw-message"
      })
    }));

    createInternalRuntimeExecutionMock.mockResolvedValue({
      adapter: {
        execute,
        provider: "mock"
      },
      provider: "mock"
    });

    const { executeInternalRuntimeAgentActivity } = await import(
      "../src/activities/internal-runtime-agent.activity.js"
    );
    const result = await executeInternalRuntimeAgentActivity({
      agentId: "agent_tech_lead",
      agentName: "技术负责人",
      conversationId: "conv_internal",
      message: "生成验收报告",
      ownerUserId: "user_owner",
      runtimeBackend: "mock",
      workspaceId: "workspace_1"
    });

    expect(result.finalContent).toBe("已生成可下载 Markdown 验收报告。");
    expect(result.artifacts).toEqual([
      {
        fileName: "acceptance-report.md",
        markdown: "# 验收报告\n\n通过。",
        mimeType: "text/markdown",
        title: "验收报告",
        type: "markdown"
      }
    ]);
    expect(JSON.stringify(result.streamEvents)).not.toContain("artifact.markdown.create");
    expect(JSON.stringify(result.streamEvents)).not.toContain("tool_plan");
    expect(result.streamEvents).toEqual(
      createMessageLifecycleEvents({
        finalContent: "已生成可下载 Markdown 验收报告。",
        messageId: "conv_internal"
      })
    );
  });
});
