import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { StreamEvent } from "@agenthub/contracts";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import type { Worker } from "@temporalio/worker";
import { Client } from "pg";

import { createApp } from "../../apps/api/src/main.js";
import { bootstrapWorker } from "../../apps/worker/src/main.js";
import { signupSessionViaFetch } from "../support/auth-session.js";

const decoder = new TextDecoder();
const workspaceId = "workspace_group_orchestrator";
const workerTaskQueue = "worker-task-group-orchestrator";
const agentIds = {
  codex: "agent_group_mock_codex",
  hermes: "agent_group_orchestrator_mock_hermes"
};

describe("group orchestrator integration", () => {
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
      displayName: "Group Orchestrator Integration",
      email: `group-orchestrator-${Date.now()}@example.com`
    });
    authCookie = session.cookie;
    ownerUserId = session.user.id;
    await seedMockAgents(client, ownerUserId);

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

  it("aggregates untargeted group replies and narrows dispatch when the user mentions one member", async () => {
    const conversationResponse = await fetch(`${baseUrl}/conversations`, {
      body: JSON.stringify({
        agentIds: [agentIds.hermes, agentIds.codex],
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
        const untargetedSendResponse = await fetch(`${baseUrl}/messages/send`, {
          body: JSON.stringify({
            content: "Plan the release slice",
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

        expect(untargetedSendResponse.status).toBe(202);

        const untargetedEvents = await readEvents(streamReader!, 7);

        expect(untargetedEvents.map((event) => event.kind)).toEqual([
          "conversation.status",
          "conversation.status",
          "conversation.status",
          "conversation.message.started",
          "conversation.message.delta",
          "conversation.message.completed",
          "conversation.status"
        ]);
        expect(
          untargetedEvents
            .filter((event) => event.kind === "conversation.status")
            .map((event) => event.payload.label)
        ).toEqual([
          "orchestrator.received",
          "orchestrator.dispatched",
          "orchestrator.running",
          "orchestrator.aggregated"
        ]);

        const untargetedMessages = await waitForMessages(baseUrl, conversationId, 2, authCookie);

        expect(untargetedMessages.map((message) => message.role)).toEqual([
          "user",
          "assistant"
        ]);
        expect(untargetedMessages[1]?.content).toContain("[Hermes Planner]");
        expect(untargetedMessages[1]?.content).toContain("[Codex Builder]");
        expect(untargetedMessages[1]?.content).toContain(
          "[mock-group:agent_group_orchestrator_mock_hermes]"
        );
        expect(untargetedMessages[1]?.content).toContain(
          "[mock-group:agent_group_mock_codex]"
        );
        expect(untargetedMessages[1]?.sourceAgentId).toBeNull();

        const targetedSendResponse = await fetch(`${baseUrl}/messages/send`, {
          body: JSON.stringify({
            content: "@codex write the implementation notes",
            conversationId,
            mentionedAgentIds: [agentIds.codex],
            role: "user",
            workspaceId
          }),
          headers: {
            "Content-Type": "application/json",
            cookie: authCookie
          },
          method: "POST"
        });

        expect(targetedSendResponse.status).toBe(202);
        expect((await targetedSendResponse.json()).mentionedAgentIds).toEqual([
          agentIds.codex
        ]);

        const targetedEvents = await readEvents(streamReader!, 7);

        expect(
          targetedEvents
            .filter((event) => event.kind === "conversation.status")
            .map((event) => event.payload.label)
        ).toEqual([
          "orchestrator.received",
          "orchestrator.dispatched",
          "orchestrator.running",
          "orchestrator.aggregated"
        ]);

        const targetedMessages = await waitForMessages(baseUrl, conversationId, 4, authCookie);
        const latestAssistantMessage = targetedMessages[3];

        expect(targetedMessages.map((message) => message.role)).toEqual([
          "user",
          "assistant",
          "user",
          "assistant"
        ]);
        expect(latestAssistantMessage?.content).toContain("[Codex Builder]");
        expect(latestAssistantMessage?.content).toContain(
          "[mock-group:agent_group_mock_codex]"
        );
        expect(latestAssistantMessage?.content).not.toContain("[Hermes Planner]");
        expect(latestAssistantMessage?.sourceAgentId).toBeNull();
      } finally {
        worker.shutdown();
        await streamReader?.cancel();
      }
    });
  });
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
        ($1, null, '[]'::jsonb, 'Hermes Planner', $3, 'mock', 'Plan', '[]'::jsonb, $4),
        ($2, null, '[]'::jsonb, 'Codex Builder', $3, 'mock', 'Build', '[]'::jsonb, $4)
      ON CONFLICT DO NOTHING
    `,
    [agentIds.hermes, agentIds.codex, ownerUserId, workspaceId]
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
): Promise<Array<{ content: string; role: string; sourceAgentId: string | null }>> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const response = await fetch(
      `${baseUrl}/messages?conversationId=${conversationId}&workspaceId=${workspaceId}`,
      {
        headers: {
          cookie: authCookie
        }
      }
    );
    const messages = (await response.json()) as Array<{
      content: string;
      role: string;
      sourceAgentId: string | null;
    }>;

    if (messages.length >= expectedCount) {
      return messages;
    }

    await new Promise((resolve) => {
      setTimeout(resolve, 50);
    });
  }

  throw new Error(`Timed out waiting for ${expectedCount} persisted messages.`);
}
