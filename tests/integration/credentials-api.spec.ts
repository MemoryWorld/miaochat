import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { Client } from "pg";

import { createApp } from "../../apps/api/src/main.js";
import { signupSessionViaInject } from "../support/auth-session.js";

const testWorkspaceId = "workspace_credentials_integration";

async function clearWorkspace(client: Client): Promise<void> {
  await client.query("DELETE FROM provider_credentials WHERE workspace_id = $1", [
    testWorkspaceId
  ]);
}

describe("credentials integration", () => {
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
      displayName: "Credentials Integration",
      email: `credentials-integration-${Date.now()}@example.com`
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

  it("persists encrypted credentials and keeps list responses secret-free", async () => {
    const createResponse = await app.inject({
      headers: {
        cookie: authCookie
      },
      method: "POST",
      payload: {
        label: "Codex primary",
        provider: "codex",
        providerAccountId: "acct_codex",
        rawSecret: "sk-codex-primary",
        workspaceId: testWorkspaceId
      },
      url: "/credentials"
    });

    expect(createResponse.statusCode).toBe(201);
    const created = createResponse.json() as {
      id: string;
      provider: string;
      validationState: string;
    };

    expect(created.validationState).toBe("valid");
    expect(created.provider).toBe("codex");

    const row = await client.query<{
      encrypted_secret: string;
    }>(
      "SELECT encrypted_secret FROM provider_credentials WHERE id = $1",
      [created.id]
    );

    expect(row.rows[0]?.encrypted_secret).toBeTruthy();
    expect(row.rows[0]?.encrypted_secret).not.toContain("sk-codex-primary");

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
        id: created.id,
        label: "Codex primary",
        provider: "codex",
        validationState: "valid"
      })
    ]);
    expect(listResponse.json()[0]).not.toHaveProperty("encryptedSecret");
  });
});
