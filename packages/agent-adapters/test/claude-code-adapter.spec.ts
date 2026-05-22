import { describe, expect, it } from "vitest";

import { ClaudeCodeAdapter } from "../src/claude-code/claude-code-adapter.js";

const credentialResolver = async () => ({
  providerAccountId: "acct_claude",
  secret: "sk-ant-test-123"
});

function createSseResponseBody(events: Array<{ data: string; event: string }>): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const body =
    events
      .map((entry) => `event: ${entry.event}\ndata: ${entry.data}`)
      .join("\n\n") + "\n\n";

  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(body));
      controller.close();
    }
  });
}

describe("ClaudeCodeAdapter", () => {
  it("translates content_block_delta SSE events into the normalized contract", async () => {
    const requestLog: { body?: unknown; headers?: HeadersInit; url?: string } = {};
    const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      requestLog.url = input.toString();
      requestLog.body = init?.body;
      requestLog.headers = init?.headers;

      return new Response(
        createSseResponseBody([
          {
            data: '{"index":0,"delta":{"type":"text_delta","text":"Hello "},"type":"content_block_delta"}',
            event: "content_block_delta"
          },
          {
            data: '{"index":0,"delta":{"type":"text_delta","text":"world"},"type":"content_block_delta"}',
            event: "content_block_delta"
          },
          {
            data: '{"type":"message_stop"}',
            event: "message_stop"
          }
        ]),
        {
          headers: { "content-type": "text/event-stream" },
          status: 200
        }
      );
    }) as unknown as typeof fetch;

    const adapter = new ClaudeCodeAdapter({
      baseUrl: "https://api.claude-code.test",
      credentialResolver,
      fetchImpl
    });
    const result = await adapter.execute({
      agentId: "agent_claude_code",
      conversationId: "conv_claude_code",
      credentialId: "cred_claude_code",
      message: "Plan the rollout",
      provider: "claude-code",
      workspaceId: "workspace_claude_code"
    });

    expect(result.finalContent).toBe("Hello world");
    expect(result.streamEvents.map((event) => event.kind)).toEqual([
      "conversation.message.started",
      "conversation.message.delta",
      "conversation.message.delta",
      "conversation.message.completed"
    ]);
    expect(requestLog.url).toBe("https://api.claude-code.test/v1/messages");
    expect(JSON.parse(String(requestLog.body))).toEqual(
      expect.objectContaining({
        agent_id: "agent_claude_code",
        conversation_id: "conv_claude_code",
        model: "claude-code-default",
        stream: true,
        workspace_id: "workspace_claude_code"
      })
    );
    expect(requestLog.headers).toEqual(
      expect.objectContaining({
        "Anthropic-Version": "2023-06-01",
        "Claude-Code-Account": "acct_claude",
        "X-Api-Key": "sk-ant-test-123"
      })
    );
  });

  it("rejects requests without a BYOK credentialId", async () => {
    const adapter = new ClaudeCodeAdapter({
      credentialResolver,
      fetchImpl: (async () => new Response("", { status: 200 })) as unknown as typeof fetch
    });

    await expect(
      adapter.execute({
        agentId: "agent_claude_code",
        conversationId: "conv_claude_code",
        message: "hi",
        provider: "claude-code",
        workspaceId: "workspace_claude_code"
      })
    ).rejects.toThrow(/credentialId/);
  });

  it("rejects empty streams as a retryable provider failure", async () => {
    const fetchImpl = (async () =>
      new Response(createSseResponseBody([]), { status: 200 })) as unknown as typeof fetch;
    const adapter = new ClaudeCodeAdapter({
      credentialResolver,
      fetchImpl
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
