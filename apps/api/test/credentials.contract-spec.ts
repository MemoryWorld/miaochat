import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import type { Client } from "pg";

import {
  apiRequest,
  createContractApp,
  createDatabaseClient,
  signupViaSupertest
} from "./contract-support.js";

const emailPrefix = "credential-contract";
const workspaceId = "workspace_credential_contract";

describe("credentials api contract", () => {
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

  it("returns secret-free metadata and rejects cross-user revocation", async () => {
    const owner = await signupViaSupertest(app, {
      displayName: "Credential Owner",
      email: `${emailPrefix}-owner-${Date.now()}@example.com`
    });
    const otherUser = await signupViaSupertest(app, {
      displayName: "Credential Other",
      email: `${emailPrefix}-other-${Date.now()}@example.com`
    });

    const createResponse = await apiRequest(app)
      .post("/credentials")
      .set("Cookie", owner.cookie)
      .send({
        label: "Codex Contract",
        provider: "codex",
        providerAccountId: "acct_contract_codex",
        rawSecret: "sk-contract-secret",
        workspaceId
      });

    expect(createResponse.status).toBe(201);
    expect(createResponse.body).not.toHaveProperty("rawSecret");
    expect(createResponse.body).not.toHaveProperty("encryptedSecret");
    const credentialId = createResponse.body.id as string;

    const listResponse = await apiRequest(app)
      .get("/credentials")
      .query({ workspaceId })
      .set("Cookie", owner.cookie);

    expect(listResponse.status).toBe(200);
    expect(listResponse.body).toEqual([
      expect.objectContaining({
        id: credentialId,
        label: "Codex Contract",
        provider: "codex"
      })
    ]);

    const otherDelete = await apiRequest(app)
      .delete(`/credentials/${credentialId}`)
      .query({ workspaceId })
      .set("Cookie", otherUser.cookie);

    expect(otherDelete.status).toBe(404);
  });
});

async function clearFixtures(client: Client): Promise<void> {
  await client.query("DELETE FROM provider_credentials WHERE workspace_id = $1", [workspaceId]);
  await client.query(`DELETE FROM users WHERE email LIKE '${emailPrefix}-%@example.com'`);
}
