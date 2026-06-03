import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { StreamEvent } from "@agenthub/contracts";
import { streamEventSchema } from "@agenthub/contracts";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";

import { createApp } from "../src/main.js";
import { StreamBrokerService } from "../src/modules/streams/stream-broker.service.js";
import { signupSessionViaFetch } from "../../../tests/support/auth-session.js";

const decoder = new TextDecoder();
const workspaceId = `workspace_streaming_task_17_${Date.now()}`;
const originalStreamHeartbeatIntervalMs = process.env.STREAM_HEARTBEAT_INTERVAL_MS;

describe("streams e2e", () => {
  let app: NestFastifyApplication;
  let authCookie: string;
  let baseUrl: string;
  let broker: StreamBrokerService;
  let conversationId: string;

  beforeAll(async () => {
    process.env.STREAM_HEARTBEAT_INTERVAL_MS = "10";
    app = await createApp();
    await app.listen({
      host: "127.0.0.1",
      port: 0
    });
    baseUrl = await app.getUrl();
    broker = app.get(StreamBrokerService);

    const session = await signupSessionViaFetch(baseUrl, {
      displayName: "Streams E2E",
      email: `streams-e2e-${Date.now()}@example.com`
    });
    authCookie = session.cookie;

    const agentResponse = await fetch(`${baseUrl}/custom-agents`, {
      body: JSON.stringify({
        capabilityTags: [],
        name: "Streams SSE Agent",
        provider: "mock",
        systemPrompt: "Stream events only.",
        toolBindings: [],
        workspaceId
      }),
      headers: {
        "Content-Type": "application/json",
        cookie: authCookie
      },
      method: "POST"
    });

    if (agentResponse.status !== 201) {
      throw new Error(`Expected agent setup to succeed, received ${agentResponse.status}.`);
    }

    const agentId = (await agentResponse.json()).id as string;
    const conversationResponse = await fetch(`${baseUrl}/conversations`, {
      body: JSON.stringify({
        agentIds: [agentId],
        mode: "direct",
        workspaceId
      }),
      headers: {
        "Content-Type": "application/json",
        cookie: authCookie
      },
      method: "POST"
    });

    if (conversationResponse.status !== 201) {
      throw new Error(
        `Expected conversation setup to succeed, received ${conversationResponse.status}.`
      );
    }

    conversationId = (await conversationResponse.json()).id as string;
  });

  afterAll(async () => {
    await app.close();
    if (originalStreamHeartbeatIntervalMs === undefined) {
      delete process.env.STREAM_HEARTBEAT_INTERVAL_MS;
    } else {
      process.env.STREAM_HEARTBEAT_INTERVAL_MS = originalStreamHeartbeatIntervalMs;
    }
  });

  it("keeps the SSE stream alive with heartbeat comments and still streams published conversation events", async () => {
    const event: StreamEvent = {
      kind: "conversation.message.delta",
      payload: {
        delta: "Hello from SSE",
        messageId: "message_streaming_task_17"
      }
    };

    const response = await fetch(
      `${baseUrl}/streams/${conversationId}?workspaceId=${workspaceId}`,
      {
        headers: {
          Accept: "text/event-stream",
          cookie: authCookie
        }
      }
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");

    const reader = response.body?.getReader();
    expect(reader).toBeDefined();

    const handshakeChunk = await readChunk(reader!);
    expect(handshakeChunk).toContain(": connected");

    const heartbeatChunk = await readChunk(reader!);
    expect(heartbeatChunk).toContain(": heartbeat");

    broker.publish({
      conversationId,
      event,
      workspaceId
    });

    const dataChunk = await readUntilDataChunk(reader!);
    const parsedEvent = readFirstEvent(dataChunk);

    expect(streamEventSchema.parse(parsedEvent)).toEqual(event);

    await reader?.cancel();
  });
});

async function readChunk(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  timeoutMs = 1_000
): Promise<string> {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      reject(new Error(`Timed out waiting ${timeoutMs}ms for SSE chunk.`));
    }, timeoutMs);
  });
  let result: ReadableStreamReadResult<Uint8Array>;

  try {
    result = await Promise.race([reader.read(), timeoutPromise]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }

  if (result.done || !result.value) {
    throw new Error("Expected SSE chunk but stream closed.");
  }

  return decoder.decode(result.value);
}

async function readUntilDataChunk(
  reader: ReadableStreamDefaultReader<Uint8Array>
): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const chunk = await readChunk(reader);

    if (chunk.includes("data: ")) {
      return chunk;
    }
  }

  throw new Error("Expected SSE data chunk but only received heartbeat comments.");
}

function readFirstEvent(chunk: string): unknown {
  const dataLine = chunk
    .split("\n")
    .find((line) => line.startsWith("data: "));

  if (!dataLine) {
    throw new Error(`Expected SSE data line in chunk: ${chunk}`);
  }

  return JSON.parse(dataLine.slice("data: ".length));
}
