import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { Client } from "pg";

import { createApp } from "../../apps/api/src/main.js";
import { signupSessionViaInject } from "../support/auth-session.js";

const createdWorkspaceId = "workspace_launch_ops";
const defaultWorkspaceId = "default-workspace";

describe("workspaces integration", () => {
  let app: NestFastifyApplication;
  let client: Client;

  beforeAll(async () => {
    client = new Client({
      connectionString:
        process.env.DATABASE_URL ?? "postgres://agenthub:agenthub@localhost:5432/agenthub"
    });
    await client.connect();
    await clearWorkspaceFixtures(client);

    app = await createApp();
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterEach(async () => {
    await clearWorkspaceFixtures(client);
  });

  afterAll(async () => {
    await app.close();
    await clearWorkspaceFixtures(client);
    await client.end();
  });

  it("provisions a default workspace, creates an owned workspace, and stores resources under its workspace_id", async () => {
    const session = await signupSessionViaInject(app, {
      displayName: "Workspace Integration",
      email: `workspaces-api-${Date.now()}@example.com`
    });

    const initialList = await app.inject({
      headers: {
        cookie: session.cookie
      },
      method: "GET",
      url: "/workspaces"
    });

    expect(initialList.statusCode).toBe(200);
    expect(initialList.json()).toContainEqual(
      expect.objectContaining({
        id: defaultWorkspaceId,
        name: "Default Workspace",
        ownerUserId: session.user.id
      })
    );

    const createWorkspaceResponse = await app.inject({
      headers: {
        cookie: session.cookie
      },
      method: "POST",
      payload: {
        id: createdWorkspaceId,
        name: "Launch Ops"
      },
      url: "/workspaces"
    });

    expect(createWorkspaceResponse.statusCode).toBe(201);
    expect(createWorkspaceResponse.json()).toMatchObject({
      id: createdWorkspaceId,
      name: "Launch Ops",
      ownerUserId: session.user.id
    });

    const customAgentResponse = await app.inject({
      headers: {
        cookie: session.cookie
      },
      method: "POST",
      payload: {
        capabilityTags: ["delivery"],
        name: "Launch Operator",
        provider: "mock",
        systemPrompt: "Track launch work.",
        toolBindings: [],
        workspaceId: createdWorkspaceId
      },
      url: "/custom-agents"
    });

    expect(customAgentResponse.statusCode).toBe(201);
    const agentId = customAgentResponse.json().id as string;

    const credentialResponse = await app.inject({
      headers: {
        cookie: session.cookie
      },
      method: "POST",
      payload: {
        label: "Launch Codex",
        provider: "codex",
        providerAccountId: "acct_launch_codex",
        rawSecret: "sk-launch-secret",
        workspaceId: createdWorkspaceId
      },
      url: "/credentials"
    });

    expect(credentialResponse.statusCode).toBe(201);
    const credentialId = credentialResponse.json().id as string;

    const conversationResponse = await app.inject({
      headers: {
        cookie: session.cookie
      },
      method: "POST",
      payload: {
        agentIds: [agentId],
        mode: "direct",
        workspaceId: createdWorkspaceId
      },
      url: "/conversations"
    });

    expect(conversationResponse.statusCode).toBe(201);
    const conversationId = conversationResponse.json().id as string;

    const messageResponse = await app.inject({
      headers: {
        cookie: session.cookie
      },
      method: "POST",
      payload: {
        content: "Ship the launch checklist",
        conversationId,
        role: "user",
        workspaceId: createdWorkspaceId
      },
      url: "/messages"
    });

    expect(messageResponse.statusCode).toBe(201);
    const messageId = messageResponse.json().id as string;

    const uploadTargetResponse = await app.inject({
      headers: {
        cookie: session.cookie
      },
      method: "POST",
      payload: {
        fileName: "launch-checklist.md",
        kind: "attachment",
        messageId,
        mimeType: "text/markdown",
        title: "Launch checklist",
        workspaceId: createdWorkspaceId
      },
      url: "/artifacts/upload-target"
    });

    expect(uploadTargetResponse.statusCode).toBe(201);
    const uploadTarget = uploadTargetResponse.json() as {
      artifactId: string;
      storageKey: string;
    };

    const artifactResponse = await app.inject({
      headers: {
        cookie: session.cookie
      },
      method: "POST",
      payload: {
        id: uploadTarget.artifactId,
        kind: "attachment",
        messageId,
        mimeType: "text/markdown",
        previewUrl: null,
        storageKey: uploadTarget.storageKey,
        title: "Launch checklist",
        workspaceId: createdWorkspaceId
      },
      url: "/artifacts"
    });

    expect(artifactResponse.statusCode).toBe(201);

    const workspaceRows = await client.query<{
      id: string;
      name: string;
      owner_user_id: string;
    }>(
      `
        SELECT id, name, owner_user_id
        FROM workspaces
        WHERE owner_user_id = $1
        ORDER BY id ASC
      `,
      [session.user.id]
    );

    expect(workspaceRows.rows).toEqual(
      expect.arrayContaining([
        {
          id: createdWorkspaceId,
          name: "Launch Ops",
          owner_user_id: session.user.id
        },
        {
          id: defaultWorkspaceId,
          name: "Default Workspace",
          owner_user_id: session.user.id
        }
      ])
    );

    await expectWorkspaceId(client, "custom_agents", agentId);
    await expectWorkspaceId(client, "provider_credentials", credentialId);
    await expectWorkspaceId(client, "conversations", conversationId);
    await expectWorkspaceId(client, "messages", messageId);
    await expectWorkspaceId(client, "artifacts", uploadTarget.artifactId);
  });
});

async function clearWorkspaceFixtures(client: Client): Promise<void> {
  await client.query(
    "DELETE FROM conversations WHERE workspace_id IN ($1, $2)",
    [defaultWorkspaceId, createdWorkspaceId]
  );
  await client.query(
    "DELETE FROM provider_credentials WHERE workspace_id IN ($1, $2)",
    [defaultWorkspaceId, createdWorkspaceId]
  );
  await client.query(
    "DELETE FROM custom_agents WHERE workspace_id IN ($1, $2)",
    [defaultWorkspaceId, createdWorkspaceId]
  );
  await client.query("DELETE FROM users WHERE email LIKE 'workspaces-api-%@example.com'");
}

async function expectWorkspaceId(
  client: Client,
  tableName: "artifacts" | "conversations" | "custom_agents" | "messages" | "provider_credentials",
  rowId: string
): Promise<void> {
  const result = await client.query<{ workspace_id: string }>(
    `SELECT workspace_id FROM ${tableName} WHERE id = $1`,
    [rowId]
  );

  expect(result.rows[0]?.workspace_id).toBe(createdWorkspaceId);
}
