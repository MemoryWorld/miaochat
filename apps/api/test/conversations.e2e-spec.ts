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

async function createConversationForRetentionTest(
  app: NestFastifyApplication,
  authCookie: string,
  title: string
): Promise<string> {
  const response = await app.inject({
    headers: {
      cookie: authCookie
    },
    method: "POST",
    payload: {
      agentIds: [agentIds.hermes],
      mode: "direct",
      title,
      workspaceId
    },
    url: "/conversations"
  });

  expect(response.statusCode).toBe(201);
  return response.json().id as string;
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

  it("deletes a channel and removes it from the conversation list", async () => {
    const conversationResponse = await app.inject({
      headers: {
        cookie: authCookie
      },
      method: "POST",
      payload: {
        agentIds: [agentIds.hermes],
        mode: "direct",
        title: "Temporary channel",
        workspaceId
      },
      url: "/conversations"
    });
    const conversationId = conversationResponse.json().id as string;

    const deleteResponse = await app.inject({
      headers: {
        cookie: authCookie
      },
      method: "DELETE",
      url: `/conversations/${conversationId}?workspaceId=${workspaceId}`
    });

    expect(deleteResponse.statusCode).toBe(200);
    expect(deleteResponse.json()).toEqual({
      conversationId,
      deleted: true
    });

    const listResponse = await app.inject({
      headers: {
        cookie: authCookie
      },
      method: "GET",
      url: `/conversations?workspaceId=${workspaceId}&includeArchived=true`
    });

    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json()).toEqual([]);
  });

  it("removes archived conversations after the 30 day retention window before listing", async () => {
    const activeConversationId = await createConversationForRetentionTest(
      app,
      authCookie,
      "Active retention check"
    );
    const retainedArchivedConversationId = await createConversationForRetentionTest(
      app,
      authCookie,
      "Archived retention check"
    );
    const expiredArchivedConversationId = await createConversationForRetentionTest(
      app,
      authCookie,
      "Expired archived retention check"
    );

    await client.query(
      "UPDATE conversations SET archived_at = now() - interval '29 days' WHERE id = $1",
      [retainedArchivedConversationId]
    );
    await client.query(
      "UPDATE conversations SET archived_at = now() - interval '31 days' WHERE id = $1",
      [expiredArchivedConversationId]
    );

    const listResponse = await app.inject({
      headers: {
        cookie: authCookie
      },
      method: "GET",
      url: `/conversations?workspaceId=${workspaceId}&includeArchived=true`
    });

    expect(listResponse.statusCode).toBe(200);
    const listedConversationIds = listResponse
      .json()
      .map((conversation: { id: string }) => conversation.id);
    expect(listedConversationIds).toContain(activeConversationId);
    expect(listedConversationIds).toContain(retainedArchivedConversationId);
    expect(listedConversationIds).not.toContain(expiredArchivedConversationId);

    const expiredRows = await client.query(
      "SELECT id FROM conversations WHERE id = $1",
      [expiredArchivedConversationId]
    );
    expect(expiredRows.rows).toHaveLength(0);
  });

  it("does not restore archived conversations after the 30 day retention window", async () => {
    const conversationId = await createConversationForRetentionTest(
      app,
      authCookie,
      "Expired restore check"
    );

    const archiveResponse = await app.inject({
      headers: {
        cookie: authCookie
      },
      method: "POST",
      url: `/conversations/${conversationId}/archive?workspaceId=${workspaceId}`
    });
    expect(archiveResponse.statusCode).toBe(200);

    await client.query(
      "UPDATE conversations SET archived_at = now() - interval '31 days' WHERE id = $1",
      [conversationId]
    );

    const restoreResponse = await app.inject({
      headers: {
        cookie: authCookie
      },
      method: "POST",
      url: `/conversations/${conversationId}/restore?workspaceId=${workspaceId}`
    });

    expect(restoreResponse.statusCode).toBe(404);
    const rows = await client.query("SELECT id FROM conversations WHERE id = $1", [
      conversationId
    ]);
    expect(rows.rows).toHaveLength(0);
  });

  it("uses channel wording for generated direct and group titles", async () => {
    const directResponse = await app.inject({
      headers: {
        cookie: authCookie
      },
      method: "POST",
      payload: {
        agentIds: [agentIds.hermes],
        mode: "direct",
        workspaceId
      },
      url: "/conversations"
    });

    expect(directResponse.statusCode).toBe(201);
    expect(directResponse.json()).toMatchObject({
      mode: "direct",
      title: "Conversation Hermes频道"
    });

    const groupResponse = await app.inject({
      headers: {
        cookie: authCookie
      },
      method: "POST",
      payload: {
        agentIds: [agentIds.hermes, agentIds.codex],
        mode: "group",
        workspaceId
      },
      url: "/conversations"
    });

    expect(groupResponse.statusCode).toBe(201);
    expect(groupResponse.json()).toMatchObject({
      mode: "group",
      title: "Conversation Hermes + Conversation Codex协作频道"
    });
  });

  it("respects explicit conversation titles", async () => {
    const response = await app.inject({
      headers: {
        cookie: authCookie
      },
      method: "POST",
      payload: {
        agentIds: [agentIds.hermes],
        mode: "direct",
        title: "Release planning",
        workspaceId
      },
      url: "/conversations"
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      mode: "direct",
      title: "Release planning"
    });
  });

  it("creates and binds a new teammate to the current channel", async () => {
    const conversationResponse = await app.inject({
      headers: {
        cookie: authCookie
      },
      method: "POST",
      payload: {
        agentIds: [agentIds.hermes],
        mode: "direct",
        workspaceId
      },
      url: "/conversations"
    });
    const conversationId = conversationResponse.json().id as string;

    const addResponse = await app.inject({
      headers: {
        cookie: authCookie
      },
      method: "POST",
      payload: {
        teammate: {
          approvalMode: "balanced",
          avatarUrl: null,
          capabilityTags: ["测试", "频道"],
          memoryMode: "workspace_plus_teammate",
          modelProfileId: "balanced",
          name: `频道测试同事 ${Date.now()}`,
          outputStyle: "先给结论，再列出验证步骤。",
          scopeDescription: "只处理当前频道中的验证任务。",
          systemPrompt: "你是当前频道中的测试同事。",
          toolBindings: []
        },
        workspaceId
      },
      url: `/conversations/${conversationId}/teammates`
    });

    expect(addResponse.statusCode).toBe(201);
    expect(addResponse.json()).toMatchObject({
      agent: {
        provider: "opencode",
        workspaceId
      },
      conversation: {
        id: conversationId,
        mode: "group",
        workspaceId
      }
    });
    expect(addResponse.json().conversation.participants).toEqual(
      expect.arrayContaining([
        {
          agentId: agentIds.hermes,
          agentName: "Conversation Hermes"
        },
        {
          agentId: addResponse.json().agent.id,
          agentName: addResponse.json().agent.name
        }
      ])
    );

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
      mode: "group"
    });
    expect(listResponse.json()[0].participants).toEqual(
      expect.arrayContaining([
        {
          agentId: addResponse.json().agent.id,
          agentName: addResponse.json().agent.name
        }
      ])
    );
  });

  it("adds a numeric suffix when the requested teammate name already exists in the channel", async () => {
    const conversationResponse = await app.inject({
      headers: {
        cookie: authCookie
      },
      method: "POST",
      payload: {
        agentIds: [agentIds.hermes],
        mode: "direct",
        workspaceId
      },
      url: "/conversations"
    });
    const conversationId = conversationResponse.json().id as string;

    const addResponse = await app.inject({
      headers: {
        cookie: authCookie
      },
      method: "POST",
      payload: {
        teammate: {
          approvalMode: "balanced",
          avatarUrl: null,
          capabilityTags: ["计划"],
          memoryMode: "workspace_plus_teammate",
          modelProfileId: "balanced",
          name: "Conversation Hermes",
          outputStyle: "先给结论，再列出计划。",
          scopeDescription: "补充当前频道中的规划工作。",
          systemPrompt: "你是当前频道中的规划同事。",
          toolBindings: []
        },
        workspaceId
      },
      url: `/conversations/${conversationId}/teammates`
    });

    expect(addResponse.statusCode).toBe(201);
    expect(addResponse.json()).toMatchObject({
      agent: {
        name: "Conversation Hermes1",
        provider: "opencode",
        workspaceId
      },
      conversation: {
        id: conversationId,
        mode: "group"
      }
    });
    expect(addResponse.json().conversation.participants).toEqual(
      expect.arrayContaining([
        {
          agentId: agentIds.hermes,
          agentName: "Conversation Hermes"
        },
        {
          agentId: addResponse.json().agent.id,
          agentName: "Conversation Hermes1"
        }
      ])
    );
  });
});
