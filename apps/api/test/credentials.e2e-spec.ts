import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { Client } from "pg";

import { createApp } from "../src/main.js";
import { signupSessionViaInject } from "../../../tests/support/auth-session.js";

const testWorkspaceId = "workspace_credentials_e2e";

async function clearWorkspace(client: Client): Promise<void> {
  await client.query("DELETE FROM provider_credentials WHERE workspace_id = $1", [
    testWorkspaceId
  ]);
}

describe("credentials api", () => {
  let app: NestFastifyApplication;
  let client: Client;
  let authCookie: string;

  beforeAll(async () => {
    client = new Client({
      connectionString:
        process.env.DATABASE_URL ?? "postgres://agenthub:agenthub@localhost:5432/agenthub"
    });
    await client.connect();
    await clearWorkspace(client);

    app = await createApp();
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    const session = await signupSessionViaInject(app, {
      displayName: "Credentials E2E",
      email: `credentials-e2e-${Date.now()}@example.com`
    });
    authCookie = session.cookie;
  });

  afterEach(async () => {
    await clearWorkspace(client);
  });

  afterAll(async () => {
    await app.close();
    await client.end();
  });

  it("validates credentials without persisting them", async () => {
    const response = await app.inject({
      headers: {
        cookie: authCookie
      },
      method: "POST",
      payload: {
        label: "Hermes dev",
        provider: "hermes",
        providerAccountId: "acct_hermes",
        rawSecret: "hermes_demo_token",
        workspaceId: testWorkspaceId
      },
      url: "/credentials/validate"
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      message: "Hermes credential passed local format validation.",
      providerAccountId: "acct_hermes",
      valid: true
    });

    const result = await client.query(
      "SELECT COUNT(*)::int AS count FROM provider_credentials WHERE workspace_id = $1",
      [testWorkspaceId]
    );

    expect(result.rows[0]?.count).toBe(0);
  });

  it("creates, lists, and revokes credentials without returning raw or encrypted secrets", async () => {
    const createResponse = await app.inject({
      headers: {
        cookie: authCookie
      },
      method: "POST",
      payload: {
        label: "Claude prod",
        provider: "claude-code",
        providerAccountId: "acct_claude",
        rawSecret: "sk-ant-demo-secret",
        workspaceId: testWorkspaceId
      },
      url: "/credentials"
    });

    expect(createResponse.statusCode).toBe(201);
    expect(createResponse.json()).toMatchObject({
      credentialSource: "user_provided",
      label: "Claude prod",
      provider: "claude-code",
      providerAccountId: "acct_claude",
      validationState: "valid",
      workspaceId: testWorkspaceId
    });
    expect(createResponse.json()).not.toHaveProperty("encryptedSecret");
    expect(createResponse.json()).not.toHaveProperty("rawSecret");

    const credentialId = createResponse.json().id as string;

    const stored = await client.query<{
      encrypted_secret: string;
    }>(
      "SELECT encrypted_secret FROM provider_credentials WHERE id = $1",
      [credentialId]
    );

    expect(stored.rows[0]?.encrypted_secret).toBeTruthy();
    expect(stored.rows[0]?.encrypted_secret).not.toContain("sk-ant-demo-secret");

    const listResponse = await app.inject({
      headers: {
        cookie: authCookie
      },
      method: "GET",
      url: `/credentials?workspaceId=${testWorkspaceId}`
    });

    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json()).toEqual([
      expect.objectContaining({
        id: credentialId,
        label: "Claude prod",
        provider: "claude-code"
      })
    ]);

    const revokeResponse = await app.inject({
      headers: {
        cookie: authCookie
      },
      method: "DELETE",
      url: `/credentials/${credentialId}?workspaceId=${testWorkspaceId}`
    });

    expect(revokeResponse.statusCode).toBe(200);
    expect(revokeResponse.json()).toEqual({
      deleted: true,
      id: credentialId,
      workspaceId: testWorkspaceId
    });

    const remaining = await client.query(
      "SELECT COUNT(*)::int AS count FROM provider_credentials WHERE workspace_id = $1",
      [testWorkspaceId]
    );

    expect(remaining.rows[0]?.count).toBe(0);
  });

  it("rejects invalid provider secrets on create", async () => {
    const response = await app.inject({
      headers: {
        cookie: authCookie
      },
      method: "POST",
      payload: {
        label: "OpenClaw invalid",
        provider: "openclaw",
        providerAccountId: "acct_openclaw",
        rawSecret: "not-a-valid-secret",
        workspaceId: testWorkspaceId
      },
      url: "/credentials"
    });

    expect(response.statusCode).toBe(400);

    const result = await client.query(
      "SELECT COUNT(*)::int AS count FROM provider_credentials WHERE workspace_id = $1",
      [testWorkspaceId]
    );

    expect(result.rows[0]?.count).toBe(0);
  });
});
