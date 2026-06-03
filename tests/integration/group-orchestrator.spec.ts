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
  builder: "agent_group_02_builder",
  planner: "agent_group_01_planner"
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

  it("persists collaborative group replies and narrows dispatch when mentioned", async () => {
    const conversationResponse = await fetch(`${baseUrl}/conversations`, {
      body: JSON.stringify({
        agentIds: [agentIds.planner, agentIds.builder],
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

        const untargetedMessages = await waitForMessages(baseUrl, conversationId, 3, authCookie);

        expect(untargetedMessages.map((message) => message.role)).toEqual([
          "user",
          "assistant",
          "assistant"
        ]);
        expect(untargetedMessages.slice(1).map((message) => message.sourceAgentId)).toEqual([
          agentIds.planner,
          agentIds.builder
        ]);
        const plannerUntargetedMessage = untargetedMessages.find(
          (message) => message.sourceAgentId === agentIds.planner
        );
        const builderUntargetedMessage = untargetedMessages.find(
          (message) => message.sourceAgentId === agentIds.builder
        );
        expect(plannerUntargetedMessage?.content).toContain(
          "[mock-group:agent_group_01_planner]"
        );
        expect(builderUntargetedMessage?.content).toContain(
          "[mock-group:agent_group_02_builder]"
        );

        const harnessEvents = await fetchJson<Array<{ type: string; sourceAgentId?: string }>>(
          `${baseUrl}/channels/${conversationId}/events?workspaceId=${workspaceId}`,
          authCookie
        );
        expect(harnessEvents.map((event) => event.type)).toEqual([
          "user_message",
          "agent_message",
          "agent_message"
        ]);

        const harnessTurns = await fetchJson<
          Array<{
            agentId: string;
            contextSnapshotId: string | null;
            reason: string;
            status: string;
          }>
        >(
          `${baseUrl}/channels/${conversationId}/turns?workspaceId=${workspaceId}`,
          authCookie
        );
        expect(harnessTurns).toHaveLength(2);
        expect(harnessTurns.map((turn) => turn.agentId)).toEqual([
          agentIds.planner,
          agentIds.builder
        ]);
        expect(harnessTurns).toEqual(expect.arrayContaining([
          expect.objectContaining({
            agentId: agentIds.planner,
            contextSnapshotId: expect.any(String),
            reason: "scheduled_followup",
            status: "completed"
          }),
          expect.objectContaining({
            agentId: agentIds.builder,
            contextSnapshotId: expect.any(String),
            reason: "scheduled_followup",
            status: "completed"
          })
        ]));

        const contextSnapshots = await fetchJson<Array<{ agentTurnId: string }>>(
          `${baseUrl}/channels/${conversationId}/context-snapshots?workspaceId=${workspaceId}`,
          authCookie
        );
        expect(contextSnapshots).toHaveLength(2);

        const targetedSendResponse = await fetch(`${baseUrl}/messages/send`, {
          body: JSON.stringify({
            content: "@builder write the implementation notes",
            conversationId,
            mentionedAgentIds: [agentIds.builder],
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
          agentIds.builder
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

        const targetedMessages = await waitForMessages(baseUrl, conversationId, 5, authCookie);
        const latestAssistantMessage = targetedMessages[4];

        expect(targetedMessages.map((message) => message.role)).toEqual([
          "user",
          "assistant",
          "assistant",
          "user",
          "assistant"
        ]);
        expect(latestAssistantMessage?.content).toContain(
          "[mock-group:agent_group_02_builder]"
        );
        expect(latestAssistantMessage?.sourceAgentId).toBe(agentIds.builder);

        let expectedMessageCount = 5;
        const designQuestions = [
          "长程任务的上下文交接怎么设计？",
          "工具执行权限和失败回滚怎么设计？",
          "多 Agent 评审闭环怎么设计？"
        ];

        for (const question of designQuestions) {
          const designSendResponse = await fetch(`${baseUrl}/messages/send`, {
            body: JSON.stringify({
              content: question,
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

          expect(designSendResponse.status).toBe(202);
          await readEvents(streamReader!, 7);
          expectedMessageCount += 3;

          const designMessages = await waitForMessages(
            baseUrl,
            conversationId,
            expectedMessageCount,
            authCookie
          );
          const latestReplies = designMessages.slice(-2);

          expect(latestReplies.map((message) => message.role)).toEqual([
            "assistant",
            "assistant"
          ]);
          expect(new Set(latestReplies.map((message) => message.sourceAgentId))).toEqual(
            new Set([agentIds.planner, agentIds.builder])
          );
          expect(latestReplies.every((message) => message.content.includes(question))).toBe(true);
        }
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
        ($1, null, '["channel:coordinator"]'::jsonb, 'Planning Teammate', $3, 'mock', 'Plan', '[]'::jsonb, $4),
        ($2, null, '[]'::jsonb, 'Build Teammate', $3, 'mock', 'Build', '[]'::jsonb, $4)
      ON CONFLICT DO NOTHING
    `,
    [agentIds.planner, agentIds.builder, ownerUserId, workspaceId]
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

async function fetchJson<T>(url: string, authCookie: string): Promise<T> {
  const response = await fetch(url, {
    headers: {
      cookie: authCookie
    }
  });

  expect(response.status).toBe(200);

  return (await response.json()) as T;
}
