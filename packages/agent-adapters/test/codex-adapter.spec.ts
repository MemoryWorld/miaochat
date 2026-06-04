import { describe, expect, it } from "vitest";

import { CodexAdapter } from "../src/codex/codex-adapter.js";
import type {
  CodexClientFactory,
  CodexSdkClientOptions,
  CodexThreadEvent,
  CodexThreadOptions
} from "../src/codex/codex-types.js";

const credentialResolver = async () => ({
  providerAccountId: "acct_codex",
  secret: "sk-codex-test-123"
});

describe("CodexAdapter", () => {
  it("runs Codex through the official SDK and normalizes streamed agent messages", async () => {
    const calls: Array<{
      input: string;
      options?: CodexSdkClientOptions;
      threadOptions?: CodexThreadOptions;
    }> = [];
    const clientFactory: CodexClientFactory = (options) => ({
      startThread: (threadOptions) => ({
        runStreamed: async (input) => {
          calls.push({ input, options, threadOptions });

          return {
            events: streamCodexEvents([
              {
                thread_id: "thread_1",
                type: "thread.started"
              },
              {
                item: {
                  id: "item_1",
                  text: "Hello from Codex",
                  type: "agent_message"
                },
                type: "item.completed"
              },
              {
                type: "turn.completed",
                usage: {
                  cached_input_tokens: 0,
                  input_tokens: 10,
                  output_tokens: 3,
                  reasoning_output_tokens: 1
                }
              }
            ])
          };
        }
      })
    });
    const adapter = new CodexAdapter({
      clientFactory,
      credentialResolver,
      cwd: "/tmp/miaochat-codex",
      env: { CODEX_HOME: "/tmp/miaochat-codex-home" },
      model: "gpt-5.3-codex",
      networkAccessEnabled: false,
      sandbox: "workspace-write"
    });
    const result = await adapter.execute({
      agentId: "agent_codex",
      context: {
        pinnedMessages: [{ content: "Prefer small diffs.", id: "pin_1", role: "user" }]
      },
      conversationId: "conv_codex",
      credentialId: "cred_codex",
      instructions: "你是实现 AI 同事。",
      message: "Build the slice",
      provider: "codex",
      workspaceId: "workspace_codex"
    });

    expect(result.finalContent).toBe("Hello from Codex");
    expect(result.streamEvents.map((event) => event.kind)).toEqual([
      "conversation.message.started",
      "conversation.message.delta",
      "conversation.message.completed"
    ]);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.options).toEqual(
      expect.objectContaining({
        apiKey: "sk-codex-test-123",
        env: expect.objectContaining({ CODEX_HOME: "/tmp/miaochat-codex-home" })
      })
    );
    expect(calls[0]?.threadOptions).toEqual(
      expect.objectContaining({
        approvalPolicy: "never",
        model: "gpt-5.3-codex",
        networkAccessEnabled: false,
        sandboxMode: "workspace-write",
        workingDirectory: "/tmp/miaochat-codex"
      })
    );
    expect(calls[0]?.input).toContain("Prefer small diffs.");
    expect(calls[0]?.input).toContain("Build the slice");
  });

  it("rejects requests without a BYOK credentialId", async () => {
    const adapter = new CodexAdapter({
      clientFactory: () => ({
        startThread: () => ({
          runStreamed: async () => ({ events: streamCodexEvents([]) })
        })
      }),
      credentialResolver
    });

    await expect(
      adapter.execute({
        agentId: "agent_codex",
        conversationId: "conv_codex",
        message: "hi",
        provider: "codex",
        workspaceId: "workspace_codex"
      })
    ).rejects.toThrow(/Codex API Key/);
  });

  it("translates missing SDK runtime failures into missing_runtime adapter errors", async () => {
    const adapter = new CodexAdapter({
      clientFactory: () => ({
        startThread: () => ({
          runStreamed: async () => {
            throw new Error("spawn codex ENOENT");
          }
        })
      }),
      credentialResolver
    });

    await expect(
      adapter.execute({
        agentId: "agent_codex",
        conversationId: "conv_codex",
        credentialId: "cred_codex",
        message: "hi",
        provider: "codex",
        workspaceId: "workspace_codex"
      })
    ).rejects.toMatchObject({ code: "missing_runtime" });
  });

  it("translates streamed SDK failures into provider_failed adapter errors", async () => {
    const adapter = new CodexAdapter({
      clientFactory: () => ({
        startThread: () => ({
          runStreamed: async () => ({
            events: streamCodexEvents([
              {
                error: { message: "temporary upstream timeout" },
                type: "turn.failed"
              }
            ])
          })
        })
      }),
      credentialResolver
    });

    await expect(
      adapter.execute({
        agentId: "agent_codex",
        conversationId: "conv_codex",
        credentialId: "cred_codex",
        message: "hi",
        provider: "codex",
        workspaceId: "workspace_codex"
      })
    ).rejects.toMatchObject({ code: "provider_failed", retryable: true });
  });
});

async function* streamCodexEvents(
  events: CodexThreadEvent[]
): AsyncGenerator<CodexThreadEvent> {
  for (const event of events) {
    yield event;
  }
}
