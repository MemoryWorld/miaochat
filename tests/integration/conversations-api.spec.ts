import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { Client } from "pg";

import { createApp } from "../../apps/api/src/main.js";
import { signupSessionViaInject } from "../support/auth-session.js";

const workspaceId = "workspace_conversations_integration";
const agentIds = {
  codex: "agent_conv_codex_integration",
  hermes: "agent_conv_hermes_integration"
};

async function seedAgents(client: Client, ownerUserId: string): Promise<void> {
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
        ($1, null, '[]'::jsonb, 'Integration Codex', $3, 'codex', 'Build', '[]'::jsonb, $4),
        ($2, null, '[]'::jsonb, 'Integration Hermes', $3, 'hermes', 'Plan', '[]'::jsonb, $4)
      ON CONFLICT DO NOTHING
    `,
    [agentIds.codex, agentIds.hermes, ownerUserId, workspaceId]
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
  let authCookie: string;
  let ownerUserId: string;

  beforeAll(async () => {
    client = new Client({
      connectionString:
        process.env.DATABASE_URL ?? "postgres://agenthub:agenthub@localhost:5432/agenthub"
    });
    await client.connect();
    await clearWorkspace(client);
    await clearAgents(client);

    app = await createApp();
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    const session = await signupSessionViaInject(app, {
      displayName: "Conversations Integration",
      email: `conversations-integration-${Date.now()}@example.com`
    });
    authCookie = session.cookie;
    ownerUserId = session.user.id;

    await seedAgents(client, ownerUserId);
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
      headers: {
        cookie: authCookie
      },
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
      headers: {
        cookie: authCookie
      },
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
      headers: {
        cookie: authCookie
      },
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
