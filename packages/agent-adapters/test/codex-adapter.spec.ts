import { describe, expect, it } from "vitest";

import { CodexAdapter } from "../src/codex/codex-adapter.js";

const credentialResolver = async () => ({
  providerAccountId: "acct_codex",
  secret: "sk-codex-test-123"
});

function createSseResponseBody(events: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const body = events.join("\n\n") + "\n\n";

  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(body));
      controller.close();
    }
  });
}

describe("CodexAdapter", () => {
  it("translates OpenAI-compatible delta SSE events into the normalized contract", async () => {
    const requestLog: { body?: unknown; headers?: HeadersInit; url?: string } = {};
    const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      requestLog.url = input.toString();
      requestLog.body = init?.body;
      requestLog.headers = init?.headers;

      return new Response(
        createSseResponseBody([
          'data: {"choices":[{"delta":{"role":"assistant"},"index":0}],"id":"chatcmpl_1","model":"codex-default","object":"chat.completion.chunk"}',
          'data: {"choices":[{"delta":{"content":"Hello "},"index":0}],"id":"chatcmpl_1","model":"codex-default","object":"chat.completion.chunk"}',
          'data: {"choices":[{"delta":{"content":"world"},"index":0,"finish_reason":"stop"}],"id":"chatcmpl_1","model":"codex-default","object":"chat.completion.chunk"}',
          "data: [DONE]"
        ]),
        {
          headers: { "content-type": "text/event-stream" },
          status: 200
        }
      );
    }) as unknown as typeof fetch;

    const adapter = new CodexAdapter({
      baseUrl: "https://api.codex.test",
      credentialResolver,
      fetchImpl
    });
    const result = await adapter.execute({
      agentId: "agent_codex",
      conversationId: "conv_codex",
      credentialId: "cred_codex",
      message: "Build the slice",
      provider: "codex",
      workspaceId: "workspace_codex"
    });

    expect(result.finalContent).toBe("Hello world");
    expect(result.streamEvents.map((event) => event.kind)).toEqual([
      "conversation.message.started",
      "conversation.message.delta",
      "conversation.message.delta",
      "conversation.message.completed"
    ]);
    expect(requestLog.url).toBe("https://api.codex.test/v1/chat/completions");
    expect(JSON.parse(String(requestLog.body))).toEqual(
      expect.objectContaining({
        agent_id: "agent_codex",
        conversation_id: "conv_codex",
        model: "codex-default",
        stream: true,
        workspace_id: "workspace_codex"
      })
    );
    expect(requestLog.headers).toEqual(
      expect.objectContaining({
        Authorization: "Bearer sk-codex-test-123",
        "Codex-Account": "acct_codex"
      })
    );
  });

  it("rejects requests without a BYOK credentialId", async () => {
    const adapter = new CodexAdapter({
      credentialResolver,
      fetchImpl: (async () => new Response("", { status: 200 })) as unknown as typeof fetch
    });

    await expect(
      adapter.execute({
        agentId: "agent_codex",
        conversationId: "conv_codex",
        message: "hi",
        provider: "codex",
        workspaceId: "workspace_codex"
      })
    ).rejects.toThrow(/credentialId/);
  });

  it("translates non-2xx upstream responses to provider_failed errors", async () => {
    const fetchImpl = (async () =>
      new Response("rate limited", { status: 429 })) as unknown as typeof fetch;
    const adapter = new CodexAdapter({
      credentialResolver,
      fetchImpl
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
    ).rejects.toMatchObject({ code: "provider_failed" });
  });
});
