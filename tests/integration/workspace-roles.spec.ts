import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { Client } from "pg";

import { createApp } from "../../apps/api/src/main.js";
import { signupSessionViaInject } from "../support/auth-session.js";

const ownerEmailPrefix = "workspace-roles-owner";
const memberEmailPrefix = "workspace-roles-member";

describe("workspace roles integration", () => {
  let app: NestFastifyApplication;
  let client: Client;

  beforeAll(async () => {
    client = new Client({
      connectionString:
        process.env.DATABASE_URL ?? "postgres://agenthub:agenthub@localhost:5432/agenthub"
    });
    await client.connect();
    await clearRolesFixtures(client);

    app = await createApp();
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterEach(async () => {
    await clearRolesFixtures(client);
  });

  afterAll(async () => {
    await app.close();
    await clearRolesFixtures(client);
    await client.end();
  });

  it("promotes a member to admin, records the audit event, and exposes the new permission set", async () => {
    const ownerEmail = `${ownerEmailPrefix}-${Date.now()}@example.com`;
    const memberEmail = `${memberEmailPrefix}-${Date.now()}@example.com`;

    const ownerSession = await signupSessionViaInject(app, {
      displayName: "Roles Owner",
      email: ownerEmail
    });
    const memberSession = await signupSessionViaInject(app, {
      displayName: "Roles Member",
      email: memberEmail
    });

    const workspaceId = "default-workspace";

    // Owner invites and the member accepts.
    const invite = await app.inject({
      headers: { cookie: ownerSession.cookie },
      method: "POST",
      payload: { invitedEmail: memberEmail, role: "member" },
      url: `/workspaces/${workspaceId}/invitations`
    });
    expect(invite.statusCode).toBe(201);

    const accept = await app.inject({
      headers: { cookie: memberSession.cookie },
      method: "POST",
      payload: { token: invite.json().token as string },
      url: "/invitations/accept"
    });
    expect(accept.statusCode).toBe(200);

    // The owner promotes the member to admin.
    const promote = await app.inject({
      headers: { cookie: ownerSession.cookie },
      method: "POST",
      payload: { reason: "Trusted operator", role: "admin" },
      url: `/workspaces/${workspaceId}/members/${memberSession.user.id}/role`
    });
    expect(promote.statusCode).toBe(200);
    expect(promote.json()).toMatchObject({
      role: "admin",
      userId: memberSession.user.id
    });
    expect(promote.json().permissions).toEqual(
      expect.arrayContaining([
        "workspace.audit.read",
        "workspace.invitations.manage",
        "credential.manage"
      ])
    );

    // The audit endpoint surfaces the change with the previous role.
    const audit = await app.inject({
      headers: { cookie: ownerSession.cookie },
      method: "GET",
      url: `/workspaces/${workspaceId}/role-audit`
    });
    expect(audit.statusCode).toBe(200);
    expect(audit.json()).toEqual([
      expect.objectContaining({
        actorUserId: ownerSession.user.id,
        nextRole: "admin",
        previousRole: "member",
        reason: "Trusted operator",
        targetUserId: memberSession.user.id
      })
    ]);

    // The owner cannot demote themselves.
    const demoteOwner = await app.inject({
      headers: { cookie: ownerSession.cookie },
      method: "POST",
      payload: { role: "member" },
      url: `/workspaces/${workspaceId}/members/${ownerSession.user.id}/role`
    });
    expect(demoteOwner.statusCode).toBe(403);

    // A non-owner cannot change roles.
    const memberAttempt = await app.inject({
      headers: { cookie: memberSession.cookie },
      method: "POST",
      payload: { role: "member" },
      url: `/workspaces/${workspaceId}/members/${ownerSession.user.id}/role`
    });
    expect(memberAttempt.statusCode).toBeGreaterThanOrEqual(400);

    // The current-user lookup returns the most permissive label per role.
    const ownerSelf = await app.inject({
      headers: { cookie: ownerSession.cookie },
      method: "GET",
      url: `/workspaces/${workspaceId}/me`
    });
    expect(ownerSelf.statusCode).toBe(200);
    expect(ownerSelf.json()).toMatchObject({
      role: "owner",
      userId: ownerSession.user.id
    });
  });
});

async function clearRolesFixtures(client: Client): Promise<void> {
  await client.query(
    `DELETE FROM users WHERE email LIKE '${ownerEmailPrefix}-%@example.com'
       OR email LIKE '${memberEmailPrefix}-%@example.com'`
  );
}
