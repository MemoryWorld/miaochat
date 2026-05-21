import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { StreamEvent } from "@agenthub/contracts";
import { streamEventSchema } from "@agenthub/contracts";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";

import { createApp } from "../src/main.js";
import { StreamBrokerService } from "../src/modules/streams/stream-broker.service.js";

const decoder = new TextDecoder();

describe("streams e2e", () => {
  let app: NestFastifyApplication;
  let baseUrl: string;
  let broker: StreamBrokerService;

  beforeAll(async () => {
    app = await createApp();
    await app.listen({
      host: "127.0.0.1",
      port: 0
    });
    baseUrl = await app.getUrl();
    broker = app.get(StreamBrokerService);
  });

  afterAll(async () => {
    await app.close();
  });

  it("streams published conversation events to browser subscribers over SSE", async () => {
    const conversationId = "conv_streaming_task_17";
    const workspaceId = "workspace_streaming_task_17";
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
          Accept: "text/event-stream"
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
