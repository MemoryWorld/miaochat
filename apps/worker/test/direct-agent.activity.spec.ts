import { createMessageLifecycleEvents } from "@agenthub/agent-sdk";
import { describe, expect, it, vi, beforeEach } from "vitest";

const { createPhaseARuntimeExecutionMock } = vi.hoisted(() => ({
  createPhaseARuntimeExecutionMock: vi.fn()
}));

vi.mock("../src/activities/provider-runtime.js", () => ({
  createPhaseARuntimeExecution: createPhaseARuntimeExecutionMock
}));

describe("executeDirectAgentActivity", () => {
  beforeEach(() => {
    createPhaseARuntimeExecutionMock.mockReset();
    vi.resetModules();
  });

  it("returns sanitized content, clean stream events, and extracted Markdown drafts for artifact envelopes", async () => {
    const rawEnvelope = JSON.stringify({
      intents: [
        {
          calls: [
            {
              idempotencyKey: "artifact:notes",
              input: {
                fileName: "notes.md",
                markdown: "# Notes",
                title: "Notes"
              },
              inputSchemaVersion: "1",
              toolName: "artifact.markdown.create"
            }
          ],
          riskLevel: "low",
          summary: "Create notes.",
          type: "tool_plan"
        }
      ],
      visibleMessage: "我已整理好 Markdown 笔记。"
    });
    const execute = vi.fn(async () => ({
      finalContent: rawEnvelope,
      streamEvents: createMessageLifecycleEvents({
        finalContent: rawEnvelope,
        messageId: "raw-message"
      })
    }));

    createPhaseARuntimeExecutionMock.mockResolvedValue({
      adapter: {
        execute,
        provider: "mock"
      },
      provider: "mock"
    });

    const { executeDirectAgentActivity } = await import(
      "../src/activities/direct-agent.activity.js"
    );
    const result = await executeDirectAgentActivity({
      agentId: "agent_writer",
      agentName: "Writer",
      conversationId: "conv_direct",
      message: "生成 Markdown 笔记",
      ownerUserId: "user_owner",
      provider: "mock",
      workspaceId: "workspace_1"
    });

    expect(result.finalContent).toBe("我已整理好 Markdown 笔记。");
    expect(result.artifacts).toEqual([
      {
        fileName: "notes.md",
        markdown: "# Notes",
        mimeType: "text/markdown",
        title: "Notes",
        type: "markdown"
      }
    ]);
    expect(JSON.stringify(result.streamEvents)).not.toContain("artifact.markdown.create");
    expect(JSON.stringify(result.streamEvents)).not.toContain("tool_plan");
    expect(result.streamEvents).toEqual(
      createMessageLifecycleEvents({
        finalContent: "我已整理好 Markdown 笔记。",
        messageId: "conv_direct"
      })
    );
  });
});
