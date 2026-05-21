import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { Client } from "pg";

import { createApp } from "../../apps/api/src/main.js";

const workspaceId = "workspace_group_membership";
const agentIds = {
  codex: "agent_group_codex",
  hermes: "agent_group_hermes",
  outsider: "agent_group_outsider"
};

describe("group membership integration", () => {
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

  it("persists explicit group targets and rejects mentioned agents that are not members", async () => {
    const conversationResponse = await app.inject({
      method: "POST",
      payload: {
        agentIds: [agentIds.hermes, agentIds.codex],
        mode: "group",
        title: "Multi-agent planning",
        workspaceId
      },
      url: "/conversations"
    });

    expect(conversationResponse.statusCode).toBe(201);
    const conversationId = conversationResponse.json().id as string;

    const targetedMessageResponse = await app.inject({
      method: "POST",
      payload: {
        content: "@hermes plan the release next step",
        conversationId,
        mentionedAgentIds: [agentIds.hermes],
        role: "user",
        workspaceId
      },
      url: "/messages"
    });

    expect(targetedMessageResponse.statusCode).toBe(201);
    expect(targetedMessageResponse.json()).toMatchObject({
      content: "@hermes plan the release next step",
      mentionedAgentIds: [agentIds.hermes]
    });

    const historyResponse = await app.inject({
      method: "GET",
      url: `/messages?conversationId=${conversationId}&workspaceId=${workspaceId}`
    });

    expect(historyResponse.statusCode).toBe(200);
    expect(historyResponse.json()).toEqual([
      expect.objectContaining({
        content: "@hermes plan the release next step",
        mentionedAgentIds: [agentIds.hermes]
      })
    ]);

    const invalidTargetResponse = await app.inject({
      method: "POST",
      payload: {
        content: "@outsider jump in",
        conversationId,
        mentionedAgentIds: [agentIds.outsider],
        role: "user",
        workspaceId
      },
      url: "/messages"
    });

    expect(invalidTargetResponse.statusCode).toBe(400);
    expect(invalidTargetResponse.json().message).toContain(
      "Mentioned agents must belong to the conversation."
    );

    const persistedMessages = await client.query<{
      content: string;
      mentioned_agent_ids: string[];
    }>(
      `
        SELECT content, mentioned_agent_ids
        FROM messages
        WHERE conversation_id = $1 AND workspace_id = $2
        ORDER BY created_at ASC
      `,
      [conversationId, workspaceId]
    );

    expect(persistedMessages.rows).toEqual([
      {
        content: "@hermes plan the release next step",
        mentioned_agent_ids: [agentIds.hermes]
      }
    ]);
  });
});

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
        ($1, null, '[]'::jsonb, 'Hermes Planner', 'hermes', 'Plan', '[]'::jsonb, $4),
        ($2, null, '[]'::jsonb, 'Codex Builder', 'codex', 'Build', '[]'::jsonb, $4),
        ($3, null, '[]'::jsonb, 'Claude Outsider', 'claude-code', 'Observe', '[]'::jsonb, $4)
      ON CONFLICT DO NOTHING
    `,
    [agentIds.hermes, agentIds.codex, agentIds.outsider, workspaceId]
  );
}

async function clearWorkspace(client: Client): Promise<void> {
  await client.query("DELETE FROM conversations WHERE workspace_id = $1", [workspaceId]);
}

async function clearAgents(client: Client): Promise<void> {
  await client.query("DELETE FROM custom_agents WHERE workspace_id = $1", [workspaceId]);
}
