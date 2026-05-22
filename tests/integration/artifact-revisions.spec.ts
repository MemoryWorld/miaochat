import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { Client } from "pg";

import { createApp } from "../../apps/api/src/main.js";
import { signupSessionViaInject } from "../support/auth-session.js";

const userPrefix = "artifact-revisions";

describe("artifact revisions integration", () => {
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

  it("appends an immutable revision chain and exposes consecutive diffs", async () => {
    const session = await signupSessionViaInject(app, {
      displayName: "Artifact Revisions",
      email: `${userPrefix}-${Date.now()}@example.com`
    });

    const workspaceId = "default-workspace";

    // Seed a conversation, message, and artifact directly so the test
    // focuses on the revision chain semantics rather than upstream paths.
    const conversationCreate = await app.inject({
      headers: { cookie: session.cookie },
      method: "POST",
      payload: {
        agentIds: ["agent_mock"],
        mode: "direct",
        workspaceId
      },
      url: "/conversations"
    });

    // The default-workspace + agent_mock isn't seeded, so if the test
    // environment doesn't ship that seed we tolerate a 4xx for the
    // conversation create and fall back to direct DB seeds for the rest.
    const conversationId = conversationCreate.statusCode === 201
      ? (conversationCreate.json().id as string)
      : await seedConversation(client, session.user.id);

    const messageId = await seedMessage(client, conversationId, session.user.id);
    const artifactId = await seedArtifact(client, messageId);

    const digestA = "a".repeat(64);
    const digestB = "b".repeat(64);

    const first = await app.inject({
      headers: { cookie: session.cookie },
      method: "POST",
      payload: { contentDigest: digestA, summary: "Initial draft" },
      url: `/artifacts/${artifactId}/revisions`
    });
    expect(first.statusCode).toBe(201);
    expect(first.json()).toMatchObject({
      contentDigest: digestA,
      revisionIndex: 0
    });

    const second = await app.inject({
      headers: { cookie: session.cookie },
      method: "POST",
      payload: {
        contentDigest: digestB,
        summary: "Iterate copy"
      },
      url: `/artifacts/${artifactId}/revisions`
    });
    expect(second.statusCode).toBe(201);
    expect(second.json()).toMatchObject({
      contentDigest: digestB,
      parentRevisionId: first.json().id,
      revisionIndex: 1
    });

    const list = await app.inject({
      headers: { cookie: session.cookie },
      method: "GET",
      url: `/artifacts/${artifactId}/revisions`
    });
    expect(list.statusCode).toBe(200);
    expect(list.json()).toHaveLength(2);

    const diff = await app.inject({
      headers: { cookie: session.cookie },
      method: "GET",
      url: `/artifacts/${artifactId}/revisions/1/diff`
    });
    expect(diff.statusCode).toBe(200);
    expect(diff.json()).toMatchObject({
      after: { contentDigest: digestB, revisionIndex: 1 },
      before: { contentDigest: digestA, revisionIndex: 0 }
    });
  });
});

async function clearFixtures(client: Client): Promise<void> {
  await client.query(
    `DELETE FROM users WHERE email LIKE '${userPrefix}-%@example.com'`
  );
}

async function seedConversation(
  client: Client,
  ownerUserId: string
): Promise<string> {
  const conversationId = `conv_artifact_rev_${Date.now()}`;
  await client.query(
    `
      INSERT INTO conversations (id, mode, owner_user_id, pinned_message_ids, title, workspace_id)
      VALUES ($1, 'direct', $2, '[]'::jsonb, 'Artifact rev', 'default-workspace')
    `,
    [conversationId, ownerUserId]
  );
  return conversationId;
}

async function seedMessage(
  client: Client,
  conversationId: string,
  ownerUserId: string
): Promise<string> {
  const messageId = `msg_artifact_rev_${Date.now()}`;
  await client.query(
    `
      INSERT INTO messages (
        id, conversation_id, role, content,
        mentioned_agent_ids, owner_user_id, source_agent_id,
        is_pinned, workspace_id
      )
      VALUES ($1, $2, 'assistant', 'seed', '[]'::jsonb, $3, NULL, false, 'default-workspace')
    `,
    [messageId, conversationId, ownerUserId]
  );
  return messageId;
}

async function seedArtifact(client: Client, messageId: string): Promise<string> {
  const artifactId = `art_rev_${Date.now()}`;
  await client.query(
    `
      INSERT INTO artifacts (
        id, kind, message_id, mime_type, preview_url, storage_key, title, workspace_id
      )
      VALUES ($1, 'attachment', $2, 'text/plain', NULL, NULL, 'Seed', 'default-workspace')
    `,
    [artifactId, messageId]
  );
  return artifactId;
}
