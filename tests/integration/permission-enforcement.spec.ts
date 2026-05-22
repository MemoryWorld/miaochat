import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { Client } from "pg";

import { createApp } from "../../apps/api/src/main.js";
import { signupSessionViaInject } from "../support/auth-session.js";

const userEmailPrefix = "permission-enforcement";

describe("permission enforcement integration", () => {
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

  it("denies role-restricted operations with a structured 403 once the user is demoted to member", async () => {
    const email = `${userEmailPrefix}-${Date.now()}@example.com`;
    const session = await signupSessionViaInject(app, {
      displayName: "Permission Enforcement",
      email
    });

    const workspaceId = "default-workspace";

    // The owner can list role audits (workspace.audit.read = admin/owner only).
    const auditOwner = await app.inject({
      headers: { cookie: session.cookie },
      method: "GET",
      url: `/workspaces/${workspaceId}/role-audit`
    });
    expect(auditOwner.statusCode).toBe(200);

    // Demote the owner to member directly in the DB so we can exercise the
    // permission boundary. The application path forbids self-demotion, but
    // this is a deliberate fixture for the guard test.
    await client.query(
      `
        UPDATE workspace_members
        SET role = 'member', updated_at = now()
        WHERE workspace_owner_user_id = $1
          AND workspace_id = $2
          AND user_id = $1
      `,
      [session.user.id, workspaceId]
    );

    // workspace.audit.read is admin-only — a member should be denied.
    const auditMember = await app.inject({
      headers: { cookie: session.cookie },
      method: "GET",
      url: `/workspaces/${workspaceId}/role-audit`
    });
    expect(auditMember.statusCode).toBe(403);

    // credential.manage is admin-only — POST /credentials is denied.
    const createCredential = await app.inject({
      headers: { cookie: session.cookie },
      method: "POST",
      payload: {
        label: "Restricted",
        provider: "codex",
        providerAccountId: "acct_perm",
        rawSecret: "sk-perm",
        workspaceId
      },
      url: "/credentials"
    });
    expect(createCredential.statusCode).toBe(403);

    // custom_agent.manage is admin-only — POST /custom-agents is denied.
    const createAgent = await app.inject({
      headers: { cookie: session.cookie },
      method: "POST",
      payload: {
        capabilityTags: [],
        name: "Restricted Agent",
        provider: "mock",
        systemPrompt: "Cannot create.",
        toolBindings: [],
        workspaceId
      },
      url: "/custom-agents"
    });
    expect(createAgent.statusCode).toBe(403);

    // conversation.read is granted to the member role, so listing
    // conversations stays accessible.
    const listConversations = await app.inject({
      headers: { cookie: session.cookie },
      method: "GET",
      url: `/conversations?workspaceId=${workspaceId}`
    });
    expect(listConversations.statusCode).toBe(200);
  });
});

async function clearFixtures(client: Client): Promise<void> {
  await client.query(
    `DELETE FROM users WHERE email LIKE '${userEmailPrefix}-%@example.com'`
  );
}
