import { describe, expect, it } from "vitest";

import { ClaudeCodeAdapter } from "../src/claude-code/claude-code-adapter.js";
import type { ClaudeAgentQuery } from "../src/claude-code/claude-code-types.js";

const credentialResolver = async () => ({
  providerAccountId: "acct_claude",
  secret: "sk-ant-test-123"
});

describe("ClaudeCodeAdapter", () => {
  it("runs Claude through the Agent SDK query interface and normalizes streamed text", async () => {
    const calls: Array<{ options?: Record<string, unknown>; prompt: string }> = [];
    const queryImpl: ClaudeAgentQuery = async function* (input) {
      calls.push(input);
      yield {
        content: [{ text: "Hello " }, { name: "Read", type: "tool_use" }],
        type: "assistant"
      };
      yield {
        content: [{ text: "from Claude Code" }],
        type: "assistant"
      };
      yield {
        result: "Hello from Claude Code",
        subtype: "success",
        type: "result"
      };
    };

    const adapter = new ClaudeCodeAdapter({
      credentialResolver,
      cwd: "/tmp/miaochat-claude",
      model: "claude-sonnet-test",
      queryImpl
    });
    const result = await adapter.execute({
      agentId: "agent_claude_code",
      context: {
        pinnedMessages: [{ content: "Use strict TypeScript.", id: "pin_1", role: "user" }]
      },
      conversationId: "conv_claude_code",
      credentialId: "cred_claude_code",
      instructions: "你是代码评审 AI 同事。",
      message: "Plan the rollout",
      provider: "claude-code",
      workspaceId: "workspace_claude_code"
    });

    expect(result.finalContent).toBe("Hello from Claude Code");
    expect(result.streamEvents.map((event) => event.kind)).toEqual([
      "conversation.message.started",
      "conversation.message.delta",
      "conversation.message.delta",
      "conversation.message.completed"
    ]);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.prompt).toContain("Use strict TypeScript.");
    expect(calls[0]?.prompt).toContain("Plan the rollout");
    expect(calls[0]?.options).toEqual(
      expect.objectContaining({
        allowedTools: ["Read", "Edit", "Glob", "Grep"],
        cwd: "/tmp/miaochat-claude",
        model: "claude-sonnet-test",
        permissionMode: "acceptEdits",
        systemPrompt: "你是代码评审 AI 同事。"
      })
    );
    expect((calls[0]?.options?.env as Record<string, string>).ANTHROPIC_API_KEY).toBe(
      "sk-ant-test-123"
    );
    expect((calls[0]?.options?.env as Record<string, string>).CLAUDE_AGENT_SDK_CLIENT_APP).toBe(
      "miaochat"
    );
  });

  it("rejects requests without a BYOK credentialId", async () => {
    const adapter = new ClaudeCodeAdapter({
      credentialResolver,
      queryImpl: async function* () {
        yield { type: "result", result: "unused" };
      }
    });

    await expect(
      adapter.execute({
        agentId: "agent_claude_code",
        conversationId: "conv_claude_code",
        message: "hi",
        provider: "claude-code",
        workspaceId: "workspace_claude_code"
      })
    ).rejects.toThrow(/Claude API Key/);
  });

  it("translates SDK failures into provider_failed adapter errors", async () => {
    const adapter = new ClaudeCodeAdapter({
      credentialResolver,
      queryImpl: async function* () {
        yield { result: "unused", type: "result" };
        throw new Error("temporary upstream timeout");
      }
    });

    await expect(
      adapter.execute({
        agentId: "agent_claude_code",
        conversationId: "conv_claude_code",
        credentialId: "cred_claude_code",
        message: "hi",
        provider: "claude-code",
        workspaceId: "workspace_claude_code"
      })
    ).rejects.toMatchObject({ code: "provider_failed", retryable: true });
  });
});
