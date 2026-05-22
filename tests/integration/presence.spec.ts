import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { Client } from "pg";

import { createApp } from "../../apps/api/src/main.js";
import { signupSessionViaInject } from "../support/auth-session.js";

const userPrefix = "presence-integration";

describe("presence integration", () => {
  let app: NestFastifyApplication;
  let client: Client;

  beforeAll(async () => {
    client = new Client({
      connectionString:
        process.env.DATABASE_URL ?? "postgres://agenthub:agenthub@localhost:5432/agenthub"
    });
    await client.connect();
    await clearFixtures(client);

    app = await createApp();
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterEach(async () => {
    await clearFixtures(client);
  });

  afterAll(async () => {
    await app.close();
    await clearFixtures(client);
    await client.end();
  });

  it("publishes joined/typing/read events and reflects them in the presence snapshot", async () => {
    const session = await signupSessionViaInject(app, {
      displayName: "Presence User",
      email: `${userPrefix}-${Date.now()}@example.com`
    });

    const conversationId = "conv_presence_test";
    const workspaceId = "default-workspace";

    const join = await app.inject({
      headers: { cookie: session.cookie },
      method: "POST",
      payload: { action: "joined", workspaceId },
      url: `/streams/${conversationId}/presence`
    });
    expect(join.statusCode).toBe(202);
    expect(join.json()).toMatchObject({
      kind: "conversation.presence",
      payload: { action: "joined", conversationId, userId: session.user.id }
    });

    const typing = await app.inject({
      headers: { cookie: session.cookie },
      method: "POST",
      payload: { action: "typing", workspaceId },
      url: `/streams/${conversationId}/presence`
    });
    expect(typing.statusCode).toBe(202);

    const read = await app.inject({
      headers: { cookie: session.cookie },
      method: "POST",
      payload: { action: "read", lastReadMessageId: "msg_5", workspaceId },
      url: `/streams/${conversationId}/presence`
    });
    expect(read.statusCode).toBe(202);

    const snapshot = await app.inject({
      headers: { cookie: session.cookie },
      method: "GET",
      url: `/streams/${conversationId}/presence?workspaceId=${workspaceId}`
    });
    expect(snapshot.statusCode).toBe(200);
    expect(snapshot.json()).toMatchObject({
      conversationId,
      participants: [
        {
          action: "read",
          lastReadMessageId: "msg_5",
          userId: session.user.id
        }
      ]
    });

    const left = await app.inject({
      headers: { cookie: session.cookie },
      method: "POST",
      payload: { action: "left", workspaceId },
      url: `/streams/${conversationId}/presence`
    });
    expect(left.statusCode).toBe(202);

    const finalSnapshot = await app.inject({
      headers: { cookie: session.cookie },
      method: "GET",
      url: `/streams/${conversationId}/presence?workspaceId=${workspaceId}`
    });
    expect(finalSnapshot.statusCode).toBe(200);
    expect(finalSnapshot.json()).toMatchObject({
      conversationId,
      participants: []
    });
  });
});

async function clearFixtures(client: Client): Promise<void> {
  await client.query(
    `DELETE FROM users WHERE email LIKE '${userPrefix}-%@example.com'`
  );
}
