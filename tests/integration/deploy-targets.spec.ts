import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { Client } from "pg";

import { createApp } from "../../apps/api/src/main.js";
import { signupSessionViaInject } from "../support/auth-session.js";

const userEmailPrefix = "deploy-targets";
const deployWorkspaceId = "workspace_deploy_targets";

describe("deploy targets integration", () => {
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

  it("persists workspace deploy targets, supports all target kinds, and keeps secrets out of API responses", async () => {
    const session = await signupSessionViaInject(app, {
      displayName: "Deploy Targets",
      email: `${userEmailPrefix}-${Date.now()}@example.com`
    });

    const workspaceResponse = await app.inject({
      headers: {
        cookie: session.cookie
      },
      method: "POST",
      payload: {
        id: deployWorkspaceId,
        name: "Deploy Targets Workspace"
      },
      url: "/workspaces"
    });

    expect(workspaceResponse.statusCode).toBe(201);

    const staticSiteResponse = await app.inject({
      headers: {
        cookie: session.cookie
      },
      method: "POST",
      payload: {
        config: {
          projectName: "marketing-site",
          provider: "vercel",
          target: "preview",
          teamId: "team_marketing"
        },
        credentialSource: "user_provided",
        kind: "static-site",
        name: "Marketing Preview",
        rawSecret: "deploy-secret-static",
        workspaceId: deployWorkspaceId
      },
      url: "/deploys/targets"
    });

    expect(staticSiteResponse.statusCode).toBe(201);
    expect(staticSiteResponse.json()).toMatchObject({
      config: {
        projectName: "marketing-site",
        provider: "vercel",
        target: "preview",
        teamId: "team_marketing"
      },
      credentialSource: "user_provided",
      hasSecret: true,
      kind: "static-site",
      name: "Marketing Preview",
      ownerUserId: session.user.id,
      workspaceId: deployWorkspaceId
    });
    expect(staticSiteResponse.json()).not.toHaveProperty("encryptedSecret");
    expect(staticSiteResponse.json()).not.toHaveProperty("rawSecret");

    const containerResponse = await app.inject({
      headers: {
        cookie: session.cookie
      },
      method: "POST",
      payload: {
        config: {
          appName: "agenthub-web",
          orgSlug: "personal",
          provider: "fly",
          region: "syd"
        },
        credentialSource: "platform_managed",
        kind: "container",
        name: "Web Container",
        workspaceId: deployWorkspaceId
      },
      url: "/deploys/targets"
    });

    expect(containerResponse.statusCode).toBe(201);
    expect(containerResponse.json()).toMatchObject({
      credentialSource: "platform_managed",
      hasSecret: false,
      kind: "container",
      name: "Web Container"
    });

    const archiveResponse = await app.inject({
      headers: {
        cookie: session.cookie
      },
      method: "POST",
      payload: {
        config: {
          bucket: "agenthub-public",
          provider: "s3-compatible",
          publicBaseUrl: "https://public.example.com/agenthub-public",
          storagePrefix: "deployments/source-archives"
        },
        kind: "source-archive",
        name: "Source Bundle",
        workspaceId: deployWorkspaceId
      },
      url: "/deploys/targets"
    });

    expect(archiveResponse.statusCode).toBe(201);
    expect(archiveResponse.json()).toMatchObject({
      credentialSource: "user_provided",
      hasSecret: false,
      kind: "source-archive",
      name: "Source Bundle"
    });

    const secretRow = await client.query<{
      encrypted_secret: string | null;
      kind: string;
    }>(
      `
        SELECT encrypted_secret, kind
        FROM deploy_targets
        WHERE id = $1
      `,
      [staticSiteResponse.json().id as string]
    );

    expect(secretRow.rows[0]?.kind).toBe("static-site");
    expect(secretRow.rows[0]?.encrypted_secret).toBeTruthy();
    expect(secretRow.rows[0]?.encrypted_secret).not.toContain("deploy-secret-static");

    const listResponse = await app.inject({
      headers: {
        cookie: session.cookie
      },
      method: "GET",
      url: `/deploys/targets?workspaceId=${deployWorkspaceId}`
    });

    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json()).toEqual([
      expect.objectContaining({
        credentialSource: "user_provided",
        hasSecret: true,
        id: staticSiteResponse.json().id as string,
        kind: "static-site",
        name: "Marketing Preview"
      }),
      expect.objectContaining({
        credentialSource: "platform_managed",
        hasSecret: false,
        id: containerResponse.json().id as string,
        kind: "container",
        name: "Web Container"
      }),
      expect.objectContaining({
        credentialSource: "user_provided",
        hasSecret: false,
        id: archiveResponse.json().id as string,
        kind: "source-archive",
        name: "Source Bundle"
      })
    ]);
    expect(listResponse.json()[0]).not.toHaveProperty("encryptedSecret");
  });
});

async function clearFixtures(client: Client): Promise<void> {
  await client.query(
    `DELETE FROM users WHERE email LIKE '${userEmailPrefix}-%@example.com'`
  );
}
