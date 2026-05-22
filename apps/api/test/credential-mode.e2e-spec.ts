import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { Client } from "pg";

import { createApp } from "../src/main.js";
import { CredentialPoolService } from "../src/modules/credentials/pool.service.js";
import { signupSessionViaInject } from "../../../tests/support/auth-session.js";

const testWorkspaceId = "workspace_credential_mode_e2e";

async function clearWorkspace(client: Client): Promise<void> {
  await client.query(
    "DELETE FROM workspace_provider_credential_modes WHERE workspace_id = $1",
    [testWorkspaceId]
  );
  await client.query(
    "DELETE FROM credential_pool_entries WHERE provider_account_id = 'acct_pool_codex_east'"
  );
}

describe("credential mode api", () => {
  let app: NestFastifyApplication;
  let client: Client;
  let authCookie: string;
  let poolService: CredentialPoolService;

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
    poolService = app.get(CredentialPoolService);

    const session = await signupSessionViaInject(app, {
      displayName: "Credential Mode E2E",
      email: `credential-mode-e2e-${Date.now()}@example.com`
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

  it("enables and lists platform-managed mode when provider policy allows", async () => {
    await poolService.create({
      label: "Codex pool east",
      provider: "codex",
      providerAccountId: "acct_pool_codex_east",
      quotaClass: "standard",
      rawSecret: "sk-codex-pool-east",
      region: "us-east-1",
      tier: "shared"
    });

    const saveResponse = await app.inject({
      headers: {
        cookie: authCookie
      },
      method: "POST",
      payload: {
        credentialSource: "platform_managed",
        provider: "codex",
        workspaceId: testWorkspaceId
      },
      url: "/credentials/modes"
    });

    expect(saveResponse.statusCode).toBe(200);
    expect(saveResponse.json()).toEqual({
      credentialSource: "platform_managed",
      provider: "codex",
      workspaceId: testWorkspaceId
    });

    const listResponse = await app.inject({
      headers: {
        cookie: authCookie
      },
      method: "GET",
      url: `/credentials/modes?workspaceId=${testWorkspaceId}`
    });

    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json()).toEqual([
      {
        credentialSource: "platform_managed",
        provider: "codex",
        workspaceId: testWorkspaceId
      }
    ]);
  });

  it("rejects platform-managed mode when no pool-backed policy is available", async () => {
    const response = await app.inject({
      headers: {
        cookie: authCookie
      },
      method: "POST",
      payload: {
        credentialSource: "platform_managed",
        provider: "hermes",
        workspaceId: testWorkspaceId
      },
      url: "/credentials/modes"
    });

    expect(response.statusCode).toBe(400);
  });
});
