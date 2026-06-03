import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import type { Client } from "pg";

import {
  apiRequest,
  createContractApp,
  createDatabaseClient,
  signupViaSupertest
} from "./contract-support.js";

const emailPrefix = "artifact-contract";
const workspaceId = "workspace_artifact_contract";
const agentId = "agent_artifact_contract";

describe("artifacts api contract", () => {
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

  it("requires authentication and hides another user's message namespace", async () => {
    const owner = await signupViaSupertest(app, {
      displayName: "Artifact Owner",
      email: `${emailPrefix}-owner-${Date.now()}@example.com`
    });
    const otherUser = await signupViaSupertest(app, {
      displayName: "Artifact Other",
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
    const conversationId = conversationResponse.body.id as string;

    const messageResponse = await apiRequest(app)
      .post("/messages")
      .set("Cookie", owner.cookie)
      .send({
        content: "Create an artifact",
        conversationId,
        role: "user",
        workspaceId
      });
    const messageId = messageResponse.body.id as string;

    const unauthenticatedUpload = await apiRequest(app).post("/artifacts/upload-target").send({
      fileName: "contract.txt",
      kind: "attachment",
      messageId,
      mimeType: "text/plain",
      title: "Contract file",
      workspaceId
    });

    expect(unauthenticatedUpload.status).toBe(401);

    const ownerUpload = await apiRequest(app)
      .post("/artifacts/upload-target")
      .set("Cookie", owner.cookie)
      .send({
        fileName: "contract.txt",
        kind: "attachment",
        messageId,
        mimeType: "text/plain",
        title: "Contract file",
        workspaceId
      });

    expect(ownerUpload.status).toBe(201);
    const artifactId = ownerUpload.body.artifactId as string;

    const ownerCreate = await apiRequest(app)
      .post("/artifacts")
      .set("Cookie", owner.cookie)
      .send({
        id: artifactId,
        kind: "attachment",
        messageId,
        mimeType: "text/plain",
        previewUrl: null,
        storageKey: ownerUpload.body.storageKey,
        title: "Contract file",
        workspaceId
      });

    expect(ownerCreate.status).toBe(201);

    const otherUpload = await apiRequest(app)
      .post("/artifacts/upload-target")
      .set("Cookie", otherUser.cookie)
      .send({
        fileName: "stolen.txt",
        kind: "attachment",
        messageId,
        mimeType: "text/plain",
        title: "Stolen file",
        workspaceId
      });

    expect(otherUpload.status).toBe(404);

    const otherList = await apiRequest(app)
      .get("/artifacts")
      .query({ messageId, workspaceId })
      .set("Cookie", otherUser.cookie);

    expect(otherList.status).toBe(200);
    expect(otherList.body).toEqual([]);
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
      VALUES ($1, null, '[]'::jsonb, 'Artifact Contract Agent', $2, 'mock', 'Protect artifacts', '[]'::jsonb, $3)
      ON CONFLICT DO NOTHING
    `,
    [agentId, ownerUserId, workspaceId]
  );
}
