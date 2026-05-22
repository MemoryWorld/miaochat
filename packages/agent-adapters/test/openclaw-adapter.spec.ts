import { describe, expect, it } from "vitest";

import { OpenClawAdapter } from "../src/openclaw/openclaw-adapter.js";

const credentialResolver = async () => ({
  providerAccountId: "acct_openclaw",
  secret: "openclaw_secret_123"
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

describe("OpenClawAdapter", () => {
  it("translates SSE chunk events into the normalized streaming contract", async () => {
    const requestLog: { body?: unknown; headers?: HeadersInit; url?: string } = {};
    const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      requestLog.url = input.toString();
      requestLog.body = init?.body;
      requestLog.headers = init?.headers;

      return new Response(
        createSseResponseBody([
          'data: {"chunk":"Hello ","type":"chunk"}',
          'data: {"chunk":"world","type":"chunk"}',
          'data: {"finalContent":"Hello world","type":"completed"}',
          "data: [DONE]"
        ]),
        {
          headers: { "content-type": "text/event-stream" },
          status: 200
        }
      );
    }) as unknown as typeof fetch;

    const adapter = new OpenClawAdapter({
      baseUrl: "https://api.openclaw.test",
      credentialResolver,
      fetchImpl
    });
    const result = await adapter.execute({
      agentId: "agent_openclaw",
      conversationId: "conv_openclaw",
      credentialId: "cred_openclaw",
      message: "Run the diff",
      provider: "openclaw",
      workspaceId: "workspace_openclaw"
    });

    expect(result.finalContent).toBe("Hello world");
    expect(result.streamEvents.map((event) => event.kind)).toEqual([
      "conversation.message.started",
      "conversation.message.delta",
      "conversation.message.delta",
      "conversation.message.completed"
    ]);
    expect(requestLog.url).toBe("https://api.openclaw.test/v1/chat/completions");
    expect(JSON.parse(String(requestLog.body))).toEqual(
      expect.objectContaining({
        agentId: "agent_openclaw",
        conversationId: "conv_openclaw",
        stream: true,
        workspaceId: "workspace_openclaw"
      })
    );
    expect(requestLog.headers).toEqual(
      expect.objectContaining({
        Authorization: "Bearer openclaw_secret_123",
        "OpenClaw-Account": "acct_openclaw"
      })
    );
  });

  it("rejects requests without a BYOK credentialId", async () => {
    const adapter = new OpenClawAdapter({
      credentialResolver,
      fetchImpl: (async () => new Response("", { status: 200 })) as unknown as typeof fetch
    });

    await expect(
      adapter.execute({
        agentId: "agent_openclaw",
        conversationId: "conv_openclaw",
        message: "hi",
        provider: "openclaw",
        workspaceId: "workspace_openclaw"
      })
    ).rejects.toThrow(/credentialId/);
  });

  it("propagates structured errors emitted by the upstream stream", async () => {
    const fetchImpl = (async () =>
      new Response(
        createSseResponseBody([
          'data: {"message":"OpenClaw rate limit","retryable":true,"type":"error"}'
        ]),
        { status: 200 }
      )) as unknown as typeof fetch;
    const adapter = new OpenClawAdapter({
      credentialResolver,
      fetchImpl
    });

    await expect(
      adapter.execute({
        agentId: "agent_openclaw",
        conversationId: "conv_openclaw",
        credentialId: "cred_openclaw",
        message: "hi",
        provider: "openclaw",
        workspaceId: "workspace_openclaw"
      })
    ).rejects.toMatchObject({
      retryable: true
    });
  });
});
