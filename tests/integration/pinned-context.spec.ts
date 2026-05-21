import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import type { Worker } from "@temporalio/worker";
import { Client } from "pg";

import { createApp } from "../../apps/api/src/main.js";
import { bootstrapWorker } from "../../apps/worker/src/main.js";

const workspaceId = "workspace_pinned_context";
const mockAgentId = "agent_mock_pinned_context";

describe("pinned context integration", () => {
  let app: NestFastifyApplication;
  let baseUrl: string;
  let client: Client;
  let worker: Worker;

  beforeAll(async () => {
    client = new Client({
      connectionString:
        process.env.DATABASE_URL ?? "postgres://agenthub:agenthub@localhost:5432/agenthub"
    });
    await client.connect();
    await clearWorkspace(client);
    await seedMockAgent(client);

    app = await createApp();
    await app.listen({
      host: "127.0.0.1",
      port: 0
    });
    baseUrl = await app.getUrl();

    worker = await bootstrapWorker();
  });

  afterAll(async () => {
    await app.close();
    await clearWorkspace(client);
    await clearAgents(client);
    await client.end();
  });

  it("replays pinned messages into the provider execution path on the next send", async () => {
    const conversationResponse = await fetch(`${baseUrl}/conversations`, {
      body: JSON.stringify({
        agentIds: [mockAgentId],
        mode: "direct",
        workspaceId
      }),
      headers: {
        "Content-Type": "application/json"
      },
      method: "POST"
    });
    const conversationId = (await conversationResponse.json()).id as string;

    const firstMessageResponse = await fetch(`${baseUrl}/messages`, {
      body: JSON.stringify({
        content: "Remember this pinned note",
        conversationId,
        role: "user",
        workspaceId
      }),
      headers: {
        "Content-Type": "application/json"
      },
      method: "POST"
    });
    const firstMessage = (await firstMessageResponse.json()) as { id: string };

    const pinResponse = await fetch(
      `${baseUrl}/messages/${firstMessage.id}/pin?workspaceId=${workspaceId}`,
      {
        method: "POST"
      }
    );

    expect(pinResponse.status).toBe(200);

    await worker.runUntil(async () => {
      try {
        const sendResponse = await fetch(`${baseUrl}/messages/send`, {
          body: JSON.stringify({
            content: "Use the pinned note",
            conversationId,
            role: "user",
            workspaceId
          }),
          headers: {
            "Content-Type": "application/json"
          },
          method: "POST"
        });

        expect(sendResponse.status).toBe(202);

        const messages = await waitForMessages(baseUrl, conversationId);

        expect(messages[0]?.isPinned).toBe(true);
        expect(messages[2]?.content).toContain("[pinned] Remember this pinned note");
      } finally {
        worker.shutdown();
      }
    });
  });
});

async function seedMockAgent(client: Client): Promise<void> {
  await client.query(
    `
      INSERT INTO custom_agents (
        id,
        avatar_url,
        capability_tags,
        name,
        provider,
        system_prompt,
        tool_bindings,
        workspace_id
      )
      VALUES ($1, null, '[]'::jsonb, 'Mock Builder', 'mock', 'Pinned context agent', '[]'::jsonb, $2)
      ON CONFLICT (id) DO NOTHING
    `,
    [mockAgentId, workspaceId]
  );
}

async function clearWorkspace(client: Client): Promise<void> {
  await client.query("DELETE FROM conversations WHERE workspace_id = $1", [workspaceId]);
}

async function clearAgents(client: Client): Promise<void> {
  await client.query("DELETE FROM custom_agents WHERE workspace_id = $1", [workspaceId]);
}

async function waitForMessages(baseUrl: string, conversationId: string) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const response = await fetch(
      `${baseUrl}/messages?conversationId=${conversationId}&workspaceId=${workspaceId}`
    );
    const messages = (await response.json()) as Array<{
      content: string;
      isPinned: boolean;
    }>;

    if (messages.length >= 3) {
      return messages;
    }

    await new Promise((resolve) => {
      setTimeout(resolve, 50);
    });
  }

  throw new Error("Timed out waiting for replayed assistant message.");
}
