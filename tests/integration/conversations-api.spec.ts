import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { Client } from "pg";

import { createApp } from "../../apps/api/src/main.js";

const workspaceId = "workspace_conversations_integration";
const agentIds = {
  codex: "agent_conv_codex_integration",
  hermes: "agent_conv_hermes_integration"
};

async function seedAgents(client: Client): Promise<void> {
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
      VALUES
        ($1, null, '[]'::jsonb, 'Integration Codex', 'codex', 'Build', '[]'::jsonb, $3),
        ($2, null, '[]'::jsonb, 'Integration Hermes', 'hermes', 'Plan', '[]'::jsonb, $3)
      ON CONFLICT DO NOTHING
    `,
    [agentIds.codex, agentIds.hermes, workspaceId]
  );
}

async function clearWorkspace(client: Client): Promise<void> {
  await client.query("DELETE FROM conversations WHERE workspace_id = $1", [workspaceId]);
}

async function clearAgents(client: Client): Promise<void> {
  await client.query("DELETE FROM custom_agents WHERE workspace_id = $1", [workspaceId]);
}

describe("conversations integration", () => {
  let app: NestFastifyApplication;
  let client: Client;

  beforeAll(async () => {
    client = new Client({
      connectionString:
        process.env.DATABASE_URL ?? "postgres://agenthub:agenthub@localhost:5432/agenthub"
    });
    await client.connect();
    await clearWorkspace(client);
    await clearAgents(client);
    await seedAgents(client);

    app = await createApp();
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterEach(async () => {
    await clearWorkspace(client);
  });

  afterAll(async () => {
    await app.close();
    await clearWorkspace(client);
    await clearAgents(client);
    await client.end();
  });

  it("updates persisted pinned message ids on the conversation record", async () => {
    const conversationResponse = await app.inject({
      method: "POST",
      payload: {
        agentIds: [agentIds.codex],
        mode: "direct",
        workspaceId
      },
      url: "/conversations"
    });

    expect(conversationResponse.statusCode).toBe(201);
    const conversationId = conversationResponse.json().id as string;

    const messageResponse = await app.inject({
      method: "POST",
      payload: {
        content: "Remember this pinned note",
        conversationId,
        role: "user",
        workspaceId
      },
      url: "/messages"
    });

    expect(messageResponse.statusCode).toBe(201);
    const messageId = messageResponse.json().id as string;

    const pinResponse = await app.inject({
      method: "POST",
      url: `/messages/${messageId}/pin?workspaceId=${workspaceId}`
    });

    expect(pinResponse.statusCode).toBe(200);

    const row = await client.query<{
      pinned_message_ids: string[];
    }>(
      "SELECT pinned_message_ids FROM conversations WHERE id = $1",
      [conversationId]
    );

    expect(row.rows[0]?.pinned_message_ids).toEqual([messageId]);
  });
});
