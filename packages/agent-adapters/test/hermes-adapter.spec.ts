import { describe, expect, it } from "vitest";

import { HermesAdapter } from "../src/hermes/hermes-adapter.js";

const credentialResolver = async () => ({
  providerAccountId: "acct_hermes",
  secret: "hermes_secret_123"
});

function createNdjsonResponseBody(records: Array<Record<string, unknown>>): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const lines = records.map((record) => `${JSON.stringify(record)}\n`).join("");

  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(lines));
      controller.close();
    }
  });
}

describe("HermesAdapter", () => {
  it("translates NDJSON delta and completion records into the normalized contract", async () => {
    const requestLog: { body?: unknown; headers?: HeadersInit; url?: string } = {};
    const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      requestLog.url = input.toString();
      requestLog.body = init?.body;
      requestLog.headers = init?.headers;

      return new Response(
        createNdjsonResponseBody([
          { type: "started" },
          { text: "Hello ", type: "delta" },
          { text: "world", type: "delta" },
          { finalContent: "Hello world", type: "completed" }
        ]),
        {
          headers: { "content-type": "application/x-ndjson" },
          status: 200
        }
      );
    }) as unknown as typeof fetch;

    const adapter = new HermesAdapter({
      baseUrl: "https://api.hermes.test",
      credentialResolver,
      fetchImpl
    });
    const result = await adapter.execute({
      agentId: "agent_hermes",
      conversationId: "conv_hermes",
      credentialId: "cred_hermes",
      message: "Plan the release",
      provider: "hermes",
      workspaceId: "workspace_hermes"
    });

    expect(result.finalContent).toBe("Hello world");
    expect(result.streamEvents.map((event) => event.kind)).toEqual([
      "conversation.message.started",
      "conversation.message.delta",
      "conversation.message.delta",
      "conversation.message.completed"
    ]);
    expect(requestLog.url).toBe("https://api.hermes.test/v1/messages/stream");
    expect(JSON.parse(String(requestLog.body))).toEqual(
      expect.objectContaining({
        agentId: "agent_hermes",
        conversationId: "conv_hermes",
        prompt: "Plan the release",
        workspaceId: "workspace_hermes"
      })
    );
    expect(requestLog.headers).toEqual(
      expect.objectContaining({
        Authorization: "Bearer hermes_secret_123",
        "Hermes-Account": "acct_hermes"
      })
    );
  });

  it("rejects requests when the BYOK credentialId is missing", async () => {
    const adapter = new HermesAdapter({
      credentialResolver,
      fetchImpl: (async () => new Response("", { status: 200 })) as unknown as typeof fetch
    });

    await expect(
      adapter.execute({
        agentId: "agent_hermes",
        conversationId: "conv_hermes",
        message: "hello",
        provider: "hermes",
        workspaceId: "workspace_hermes"
      })
    ).rejects.toThrow(/credentialId/);
  });

  it("converts upstream errors into adapter errors with a retryable hint", async () => {
    const fetchImpl = (async () =>
      new Response("upstream failure", {
        status: 503
      })) as unknown as typeof fetch;
    const adapter = new HermesAdapter({
      credentialResolver,
      fetchImpl
    });

    await expect(
      adapter.execute({
        agentId: "agent_hermes",
        conversationId: "conv_hermes",
        credentialId: "cred_hermes",
        message: "hello",
        provider: "hermes",
        workspaceId: "workspace_hermes"
      })
    ).rejects.toMatchObject({
      code: "provider_failed",
      retryable: true
    });
  });
});
