import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { StreamEvent } from "@agenthub/contracts";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import type { Worker } from "@temporalio/worker";
import { Client } from "pg";

import { createApp } from "../../apps/api/src/main.js";
import { bootstrapWorker } from "../../apps/worker/src/main.js";
import { signupSessionViaFetch } from "../support/auth-session.js";

const decoder = new TextDecoder();
const workspaceId = "workspace_single_agent_mock";
const mockAgentId = "agent_mock_single_agent";
const workerTaskQueue = "worker-task-single-agent-mock";

describe("single-agent mock integration", () => {
  let app: NestFastifyApplication;
  let authCookie: string;
  let baseUrl: string;
  let client: Client;
  let ownerUserId: string;
  let previousWorkerTaskQueue: string | undefined;
  let worker: Worker;

  beforeAll(async () => {
    previousWorkerTaskQueue = process.env.WORKER_TASK_QUEUE;
    process.env.WORKER_TASK_QUEUE = workerTaskQueue;

    client = new Client({
      connectionString:
        process.env.DATABASE_URL ?? "postgres://agenthub:agenthub@localhost:5432/agenthub"
    });
    await client.connect();
    await clearWorkspace(client);

    app = await createApp();
    await app.listen({
      host: "127.0.0.1",
      port: 0
    });
    baseUrl = await app.getUrl();
    const session = await signupSessionViaFetch(baseUrl, {
      displayName: "Single Agent Mock Integration",
      email: `single-agent-mock-${Date.now()}@example.com`
    });
    authCookie = session.cookie;
    ownerUserId = session.user.id;
    await seedMockAgent(client, ownerUserId);

    worker = await bootstrapWorker();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }

    await clearWorkspace(client);
    await clearAgents(client);
    await client.end();

    process.env.WORKER_TASK_QUEUE = previousWorkerTaskQueue;
  });

  it("persists a user message, runs the mock worker flow, streams events, and reloads the assistant reply", async () => {
    const conversationResponse = await fetch(`${baseUrl}/conversations`, {
      body: JSON.stringify({
        agentIds: [mockAgentId],
        mode: "direct",
        workspaceId
      }),
      headers: {
        "Content-Type": "application/json",
        cookie: authCookie
      },
      method: "POST"
    });

    expect(conversationResponse.status).toBe(201);
    const conversationId = (await conversationResponse.json()).id as string;

    const streamResponse = await fetch(
      `${baseUrl}/streams/${conversationId}?workspaceId=${workspaceId}`,
      {
        headers: {
          Accept: "text/event-stream",
          cookie: authCookie
        }
      }
    );
    const streamReader = streamResponse.body?.getReader();

    expect(streamResponse.status).toBe(200);
    expect(streamReader).toBeDefined();
    expect(await readChunk(streamReader!)).toContain(": connected");

    await worker.runUntil(async () => {
      try {
        const sendResponse = await fetch(`${baseUrl}/messages/send`, {
          body: JSON.stringify({
            content: "Build the mock slice",
            conversationId,
            role: "user",
            workspaceId
          }),
          headers: {
            "Content-Type": "application/json",
            cookie: authCookie
          },
          method: "POST"
        });

        expect(sendResponse.status).toBe(202);

        const events = await readEvents(streamReader!, 3);

        expect(events.map((event) => event.kind)).toEqual([
          "conversation.message.started",
          "conversation.message.delta",
          "conversation.message.completed"
        ]);

        const messagesResponse = await fetch(
          `${baseUrl}/messages?conversationId=${conversationId}&workspaceId=${workspaceId}`,
          {
            headers: {
              cookie: authCookie
            }
          }
        );
        const messages = (await messagesResponse.json()) as Array<{
          content: string;
          role: string;
          sourceAgentId: string | null;
        }>;

        expect(messages.map((message) => message.role)).toEqual([
          "user",
          "assistant"
        ]);
        expect(messages[1]?.content).toContain("[mock:agent_mock_single_agent]");
        expect(messages[1]?.sourceAgentId).toBe(mockAgentId);
      } finally {
        worker.shutdown();
        await streamReader?.cancel();
      }
    });
  });
});

async function seedMockAgent(client: Client, ownerUserId: string): Promise<void> {
  await client.query(
    `
      INSERT INTO custom_agents (
        id,
        avatar_url,
        capability_tags,
        name,
        owner_user_id,
        provider,
        system_prompt,
        tool_bindings,
        workspace_id
      )
      VALUES ($1, null, '[]'::jsonb, 'Mock Builder', $2, 'mock', 'Test mock agent', '[]'::jsonb, $3)
      ON CONFLICT DO NOTHING
    `,
    [mockAgentId, ownerUserId, workspaceId]
  );
}

async function clearWorkspace(client: Client): Promise<void> {
  await client.query("DELETE FROM conversations WHERE workspace_id = $1", [workspaceId]);
}

async function clearAgents(client: Client): Promise<void> {
  await client.query("DELETE FROM custom_agents WHERE workspace_id = $1", [workspaceId]);
}

async function readChunk(
  reader: ReadableStreamDefaultReader<Uint8Array>
): Promise<string> {
  const result = await reader.read();

  if (result.done || !result.value) {
    throw new Error("Expected SSE chunk but stream closed.");
  }

  return decoder.decode(result.value);
}

async function readEvents(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  expectedCount: number
): Promise<StreamEvent[]> {
  const events: StreamEvent[] = [];

  while (events.length < expectedCount) {
    const chunk = await readChunk(reader);
    const dataLines = chunk
      .split("\n")
      .filter((line) => line.startsWith("data: "));

    for (const line of dataLines) {
      events.push(JSON.parse(line.slice("data: ".length)) as StreamEvent);
    }
  }

  return events;
}
