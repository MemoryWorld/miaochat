import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { Client } from "pg";

import {
  apiRequest,
  createContractApp,
  createDatabaseClient,
  signupViaSupertest
} from "./contract-support.js";

const emailPrefix = "message-contract";
const workspaceId = "workspace_message_contract";
const agentId = "agent_message_contract";

describe("messages api contract", () => {
  let app: NestFastifyApplication;
  let client: Client;

  beforeAll(async () => {
    client = createDatabaseClient();
    await client.connect();
    await clearFixtures(client);
    app = await createContractApp();
  });

  afterEach(async () => {
    await clearFixtures(client);
  });

  afterAll(async () => {
    await app.close();
    await clearFixtures(client);
    await client.end();
  });

  it("preserves owner-only message history and pin boundaries", async () => {
    const owner = await signupViaSupertest(app, {
      displayName: "Message Owner",
      email: `${emailPrefix}-owner-${Date.now()}@example.com`
    });
    const otherUser = await signupViaSupertest(app, {
      displayName: "Message Other",
      email: `${emailPrefix}-other-${Date.now()}@example.com`
    });

    await seedAgent(client, owner.user.id);

    const conversationResponse = await apiRequest(app)
      .post("/conversations")
      .set("Cookie", owner.cookie)
      .send({
        agentIds: [agentId],
        mode: "direct",
        workspaceId
      });

    expect(conversationResponse.status).toBe(201);
    const conversationId = conversationResponse.body.id as string;

    const messageResponse = await apiRequest(app)
      .post("/messages")
      .set("Cookie", owner.cookie)
      .send({
        content: "Lock this message",
        conversationId,
        role: "user",
        workspaceId
      });

    expect(messageResponse.status).toBe(201);
    const messageId = messageResponse.body.id as string;

    const ownerList = await apiRequest(app)
      .get("/messages")
      .query({ conversationId, workspaceId })
      .set("Cookie", owner.cookie);

    expect(ownerList.status).toBe(200);
    expect(ownerList.body).toEqual([
      expect.objectContaining({
        id: messageId,
        content: "Lock this message"
      })
    ]);

    const otherList = await apiRequest(app)
      .get("/messages")
      .query({ conversationId, workspaceId })
      .set("Cookie", otherUser.cookie);

    expect(otherList.status).toBe(404);

    const otherPin = await apiRequest(app)
      .post(`/messages/${messageId}/pin`)
      .query({ workspaceId })
      .set("Cookie", otherUser.cookie);

    expect(otherPin.status).toBe(404);
  });
});

async function clearFixtures(client: Client): Promise<void> {
  await client.query("DELETE FROM conversations WHERE workspace_id = $1", [workspaceId]);
  await client.query("DELETE FROM custom_agents WHERE workspace_id = $1", [workspaceId]);
  await client.query(`DELETE FROM users WHERE email LIKE '${emailPrefix}-%@example.com'`);
}

async function seedAgent(client: Client, ownerUserId: string): Promise<void> {
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
      VALUES ($1, null, '[]'::jsonb, 'Message Contract Agent', $2, 'mock', 'Protect messages', '[]'::jsonb, $3)
      ON CONFLICT DO NOTHING
    `,
    [agentId, ownerUserId, workspaceId]
  );
}
