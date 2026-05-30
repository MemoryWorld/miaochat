import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { StreamEvent } from "@agenthub/contracts";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import type { Worker } from "@temporalio/worker";
import { Client } from "pg";

import { createApp } from "../../apps/api/src/main.js";
import { bootstrapWorker } from "../../apps/worker/src/main.js";
import { signupSessionViaFetch } from "../support/auth-session.js";

const decoder = new TextDecoder();
const workspaceId = "workspace_group_failure";
const workerTaskQueue = "worker-task-group-failure";
const agentIds = {
  failure: "agent_group_mock_failure",
  hermes: "agent_group_partial_mock_hermes",
  timeout: "agent_group_mock_timeout"
};

describe("group failure integration", () => {
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
    await clearAgents(client);

    app = await createApp();
    await app.listen({
      host: "127.0.0.1",
      port: 0
    });
    baseUrl = await app.getUrl();
    const session = await signupSessionViaFetch(baseUrl, {
      displayName: "Group Failure Integration",
      email: `group-failure-${Date.now()}@example.com`
    });
    authCookie = session.cookie;
    ownerUserId = session.user.id;
    await seedMockAgents(client, ownerUserId);

    worker = await bootstrapWorker();
  }, 20_000);

  afterAll(async () => {
    if (app) {
      await app.close();
    }

    await clearWorkspace(client);
    await clearAgents(client);
    await client.end();

    process.env.WORKER_TASK_QUEUE = previousWorkerTaskQueue;
  }, 20_000);

  it("publishes structured partial-failure events and persists a degraded assistant reply", async () => {
    const conversationResponse = await fetch(`${baseUrl}/conversations`, {
      body: JSON.stringify({
        agentIds: [agentIds.hermes, agentIds.failure, agentIds.timeout],
        mode: "group",
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
            content: "Plan the rollback path",
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

        const events = await readEvents(streamReader!, 8);

        expect(
          events
            .filter((event) => event.kind === "conversation.status")
            .map((event) => event.payload.label)
        ).toEqual([
          "orchestrator.received",
          "orchestrator.dispatched",
          "orchestrator.running",
          "orchestrator.partial_failure",
          "orchestrator.aggregated"
        ]);

        const partialFailureEvent = events.find(
          (event) =>
            event.kind === "conversation.status" &&
            event.payload.label === "orchestrator.partial_failure"
        );

        expect(partialFailureEvent).toMatchObject({
          kind: "conversation.status",
          payload: {
            failures: [
              expect.objectContaining({
                agentId: agentIds.failure,
                code: "error"
              }),
              expect.objectContaining({
                agentId: agentIds.timeout,
                code: "timeout"
              })
            ],
            state: "failed",
            successfulAgentCount: 1,
            summary: expect.stringContaining("2 of 3"),
            totalAgentCount: 3
          }
        });

        const messages = await waitForMessages(baseUrl, conversationId, 3, authCookie);
        const successfulAssistantMessage = messages[1];
        const failureNoticeMessage = messages[2];

        expect(messages.map((message) => message.role)).toEqual([
          "user",
          "assistant",
          "assistant"
        ]);
        expect(successfulAssistantMessage?.content).toContain(
          "[mock-group:agent_group_partial_mock_hermes]"
        );
        expect(successfulAssistantMessage?.sourceAgentId).toBe(agentIds.hermes);
        expect(failureNoticeMessage?.content).toContain("部分 AI 同事暂时没有完成回复");
        expect(failureNoticeMessage?.content).toContain("Failure Scout");
        expect(failureNoticeMessage?.content).toContain("Timeout Watcher");
        expect(failureNoticeMessage?.sourceAgentId).toBeNull();
      } finally {
        worker.shutdown();
        await streamReader?.cancel();
      }
    });
  }, 20_000);
});

async function seedMockAgents(client: Client, ownerUserId: string): Promise<void> {
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
      VALUES
        ($1, null, '[]'::jsonb, 'Hermes Planner', $4, 'mock', 'Plan', '[]'::jsonb, $5),
        ($2, null, '[]'::jsonb, 'Failure Scout', $4, 'mock', 'Break', '[]'::jsonb, $5),
        ($3, null, '[]'::jsonb, 'Timeout Watcher', $4, 'mock', 'Wait', '[]'::jsonb, $5)
      ON CONFLICT DO NOTHING
    `,
    [agentIds.hermes, agentIds.failure, agentIds.timeout, ownerUserId, workspaceId]
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

async function waitForMessages(
  baseUrl: string,
  conversationId: string,
  expectedCount: number,
  authCookie: string
): Promise<
  Array<{
    content: string;
    role: string;
    sourceAgentId: string | null;
  }>
> {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const response = await fetch(
      `${baseUrl}/messages?conversationId=${conversationId}&workspaceId=${workspaceId}`,
      {
        headers: {
          cookie: authCookie
        }
      }
    );
    const payload = (await response.json()) as Array<{
      content: string;
      role: string;
      sourceAgentId: string | null;
    }>;

    if (payload.length >= expectedCount) {
      return payload;
    }

    await new Promise((resolve) => {
      setTimeout(resolve, 50);
    });
  }

  throw new Error(`Timed out waiting for ${expectedCount} messages.`);
}
