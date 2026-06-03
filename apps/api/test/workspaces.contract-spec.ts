import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import type { Client } from "pg";

import {
  apiRequest,
  createContractApp,
  createDatabaseClient,
  signupViaSupertest
} from "./contract-support.js";

const emailPrefix = "workspace-contract";
const workspaceId = "workspace_contract_alpha";

describe("workspaces api contract", () => {
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

  it("requires authentication to list workspaces", async () => {
    const response = await apiRequest(app).get("/workspaces");
    expect(response.status).toBe(401);
  });

  it("lists only the authenticated user's workspace namespace", async () => {
    const owner = await signupViaSupertest(app, {
      displayName: "Workspace Owner",
      email: `${emailPrefix}-owner-${Date.now()}@example.com`
    });
    const otherUser = await signupViaSupertest(app, {
      displayName: "Workspace Other",
      email: `${emailPrefix}-other-${Date.now()}@example.com`
    });

    const createResponse = await apiRequest(app)
      .post("/workspaces")
      .set("Cookie", owner.cookie)
      .send({
        id: workspaceId,
        name: "Workspace Contract Alpha"
      });

    expect(createResponse.status).toBe(201);

    const ownerList = await apiRequest(app)
      .get("/workspaces")
      .set("Cookie", owner.cookie);

    expect(ownerList.status).toBe(200);
    expect(ownerList.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "default-workspace",
          ownerUserId: owner.user.id
        }),
        expect.objectContaining({
          id: workspaceId,
          name: "Workspace Contract Alpha",
          ownerUserId: owner.user.id
        })
      ])
    );

    const otherList = await apiRequest(app)
      .get("/workspaces")
      .set("Cookie", otherUser.cookie);

    expect(otherList.status).toBe(200);
    expect(otherList.body).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: workspaceId,
          ownerUserId: owner.user.id
        })
      ])
    );
  });
});

async function clearFixtures(client: Client): Promise<void> {
  await client.query("DELETE FROM workspaces WHERE id = $1", [workspaceId]);
  await client.query(`DELETE FROM users WHERE email LIKE '${emailPrefix}-%@example.com'`);
}
