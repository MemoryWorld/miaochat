import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { Client } from "pg";

import { createApp } from "../src/main.js";
import { signupSessionViaInject } from "../../../tests/support/auth-session.js";

const workspaceId = "workspace_conversations_e2e";
const agentIds = {
  codex: "agent_conv_codex_e2e",
  hermes: "agent_conv_hermes_e2e"
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
        ($1, null, '[]'::jsonb, 'Conversation Codex', $3, 'codex', 'Build', '[]'::jsonb, $4),
        ($2, null, '[]'::jsonb, 'Conversation Hermes', $3, 'hermes', 'Plan', '[]'::jsonb, $4)
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

describe("conversations and messages api", () => {
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
      displayName: "Conversations E2E",
      email: `conversations-e2e-${Date.now()}@example.com`
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

  it("creates a conversation, stores message history, and pins context", async () => {
    const conversationResponse = await app.inject({
      headers: {
        cookie: authCookie
      },
      method: "POST",
      payload: {
        agentIds: [agentIds.hermes, agentIds.codex],
        mode: "group",
        title: "Release planning",
        workspaceId
      },
      url: "/conversations"
    });

    expect(conversationResponse.statusCode).toBe(201);
    expect(conversationResponse.json()).toMatchObject({
      mode: "group",
      title: "Release planning",
      workspaceId
    });
    expect(conversationResponse.json().participants).toEqual([
      {
        agentId: agentIds.hermes,
        agentName: "Conversation Hermes"
      },
      {
        agentId: agentIds.codex,
        agentName: "Conversation Codex"
      }
    ]);

    const conversationId = conversationResponse.json().id as string;

    const listResponse = await app.inject({
      headers: {
        cookie: authCookie
      },
      method: "GET",
      url: `/conversations?workspaceId=${workspaceId}`
    });

    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json()[0]).toMatchObject({
      id: conversationId,
      title: "Release planning"
    });

    const messageResponse = await app.inject({
      headers: {
        cookie: authCookie
      },
      method: "POST",
      payload: {
        content: "Pin this context for the next run.",
        conversationId,
        role: "user",
        workspaceId
      },
      url: "/messages"
    });

    expect(messageResponse.statusCode).toBe(201);
    const messageId = messageResponse.json().id as string;

    const historyResponse = await app.inject({
      headers: {
        cookie: authCookie
      },
      method: "GET",
      url: `/messages?conversationId=${conversationId}&workspaceId=${workspaceId}`
    });

    expect(historyResponse.statusCode).toBe(200);
    expect(historyResponse.json()).toEqual([
      expect.objectContaining({
        content: "Pin this context for the next run.",
        id: messageId,
        isPinned: false
      })
    ]);

    const pinResponse = await app.inject({
      headers: {
        cookie: authCookie
      },
      method: "POST",
      url: `/messages/${messageId}/pin?workspaceId=${workspaceId}`
    });

    expect(pinResponse.statusCode).toBe(200);
    expect(pinResponse.json()).toMatchObject({
      message: {
        id: messageId,
        isPinned: true
      },
      pinnedMessageIds: [messageId]
    });
  });
});
