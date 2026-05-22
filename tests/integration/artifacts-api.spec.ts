import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { Client } from "pg";

import { createApp } from "../../apps/api/src/main.js";
import { signupSessionViaInject } from "../support/auth-session.js";

const workspaceId = "workspace_artifacts_integration";
const agentId = "agent_artifact_operator";

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
      VALUES ($1, null, '[]'::jsonb, 'Artifact Operator', $2, 'mock', 'Track file outputs', '[]'::jsonb, $3)
      ON CONFLICT DO NOTHING
    `,
    [agentId, ownerUserId, workspaceId]
  );
}

async function clearWorkspace(client: Client): Promise<void> {
  await client.query("DELETE FROM conversations WHERE workspace_id = $1", [workspaceId]);
}

async function clearAgents(client: Client): Promise<void> {
  await client.query("DELETE FROM custom_agents WHERE workspace_id = $1", [workspaceId]);
}

describe("artifacts integration", () => {
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
      displayName: "Artifacts Integration",
      email: `artifacts-integration-${Date.now()}@example.com`
    });
    authCookie = session.cookie;
    ownerUserId = session.user.id;

    await seedAgent(client, ownerUserId);
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

  it("prepares an attachment upload target, persists artifact metadata, and lists artifacts by message", async () => {
    const conversationResponse = await app.inject({
      headers: {
        cookie: authCookie
      },
      method: "POST",
      payload: {
        agentIds: [agentId],
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
        content: "Attach the generated checklist",
        conversationId,
        role: "user",
        workspaceId
      },
      url: "/messages"
    });

    expect(messageResponse.statusCode).toBe(201);
    const messageId = messageResponse.json().id as string;

    const uploadTargetResponse = await app.inject({
      headers: {
        cookie: authCookie
      },
      method: "POST",
      payload: {
        fileName: "release-checklist.md",
        kind: "attachment",
        messageId,
        mimeType: "text/markdown",
        title: "Release checklist",
        workspaceId
      },
      url: "/artifacts/upload-target"
    });

    expect(uploadTargetResponse.statusCode).toBe(201);
    const uploadTarget = uploadTargetResponse.json() as {
      artifactId: string;
      previewUrl: string | null;
      storageKey: string;
      uploadHeaders: Record<string, string>;
      uploadMethod: string;
      uploadUrl: string;
    };

    expect(uploadTarget.uploadMethod).toBe("PUT");
    expect(uploadTarget.storageKey).toContain(`${workspaceId}/${messageId}/`);
    expect(uploadTarget.uploadUrl).toContain("http://localhost:9000/agenthub-dev/");
    expect(uploadTarget.uploadHeaders).toEqual({
      "content-type": "text/markdown"
    });
    expect(uploadTarget.previewUrl).toBeNull();

    const createArtifactResponse = await app.inject({
      headers: {
        cookie: authCookie
      },
      method: "POST",
      payload: {
        id: uploadTarget.artifactId,
        kind: "attachment",
        messageId,
        mimeType: "text/markdown",
        previewUrl: null,
        storageKey: uploadTarget.storageKey,
        title: "Release checklist",
        workspaceId
      },
      url: "/artifacts"
    });

    expect(createArtifactResponse.statusCode).toBe(201);
    expect(createArtifactResponse.json()).toEqual(
      expect.objectContaining({
        id: uploadTarget.artifactId,
        kind: "attachment",
        messageId,
        mimeType: "text/markdown",
        previewUrl: null,
        storageKey: uploadTarget.storageKey,
        title: "Release checklist",
        workspaceId
      })
    );

    const listResponse = await app.inject({
      headers: {
        cookie: authCookie
      },
      method: "GET",
      url: `/artifacts?messageId=${messageId}&workspaceId=${workspaceId}`
    });

    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json()).toEqual([
      expect.objectContaining({
        id: uploadTarget.artifactId,
        kind: "attachment",
        messageId,
        storageKey: uploadTarget.storageKey
      })
    ]);
  });
});
