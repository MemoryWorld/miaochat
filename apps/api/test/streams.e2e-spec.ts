import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { StreamEvent } from "@agenthub/contracts";
import { streamEventSchema } from "@agenthub/contracts";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";

import { createApp } from "../src/main.js";
import { StreamBrokerService } from "../src/modules/streams/stream-broker.service.js";
import { signupSessionViaFetch } from "../../../tests/support/auth-session.js";

const decoder = new TextDecoder();
const workspaceId = `workspace_streaming_task_17_${Date.now()}`;

describe("streams e2e", () => {
  let app: NestFastifyApplication;
  let authCookie: string;
  let baseUrl: string;
  let broker: StreamBrokerService;
  let conversationId: string;

  beforeAll(async () => {
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
  });

  it("streams published conversation events to browser subscribers over SSE", async () => {
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

    broker.publish({
      conversationId,
      event,
      workspaceId
    });

    const dataChunk = await readChunk(reader!);
    const parsedEvent = readFirstEvent(dataChunk);

    expect(streamEventSchema.parse(parsedEvent)).toEqual(event);

    await reader?.cancel();
  });
});

async function readChunk(
  reader: ReadableStreamDefaultReader<Uint8Array>
): Promise<string> {
  const result = await reader.read();

  if (result.done || !result.value) {
    throw new Error("Expected SSE chunk but stream closed.");
  }

  return decoder.decode(result.value);
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
