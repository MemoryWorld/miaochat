import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { Client } from "pg";

import { createApp } from "../../apps/api/src/main.js";
import { signupSessionViaInject } from "../support/auth-session.js";

const ownerEmailPrefix = "workspace-membership-owner";
const inviteeEmailPrefix = "workspace-membership-invitee";

describe("workspace membership integration", () => {
  let app: NestFastifyApplication;
  let client: Client;

  beforeAll(async () => {
    client = new Client({
      connectionString:
        process.env.DATABASE_URL ?? "postgres://agenthub:agenthub@localhost:5432/agenthub"
    });
    await client.connect();
    await clearMembershipFixtures(client);

    app = await createApp();
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterEach(async () => {
    await clearMembershipFixtures(client);
  });

  afterAll(async () => {
    await app.close();
    await clearMembershipFixtures(client);
    await client.end();
  });

  it("invites by email, accepts, and reports both users as workspace members", async () => {
    const ownerEmail = `${ownerEmailPrefix}-${Date.now()}@example.com`;
    const inviteeEmail = `${inviteeEmailPrefix}-${Date.now()}@example.com`;

    const ownerSession = await signupSessionViaInject(app, {
      displayName: "Membership Owner",
      email: ownerEmail
    });

    const workspaceCreate = await app.inject({
      headers: { cookie: ownerSession.cookie },
      method: "POST",
      payload: { id: "workspace_membership_test", name: "Membership Test" },
      url: "/workspaces"
    });
    expect(workspaceCreate.statusCode).toBe(201);
    const workspaceId = workspaceCreate.json().id as string;

    // Owner is automatically recorded as a member.
    const ownerMembers = await app.inject({
      headers: { cookie: ownerSession.cookie },
      method: "GET",
      url: `/workspaces/${workspaceId}/members`
    });
    expect(ownerMembers.statusCode).toBe(200);
    expect(ownerMembers.json()).toEqual([
      expect.objectContaining({
        role: "owner",
        userId: ownerSession.user.id
      })
    ]);

    // Owner issues an invitation by email.
    const inviteResponse = await app.inject({
      headers: { cookie: ownerSession.cookie },
      method: "POST",
      payload: { invitedEmail: inviteeEmail, role: "member" },
      url: `/workspaces/${workspaceId}/invitations`
    });
    expect(inviteResponse.statusCode).toBe(201);
    const issued = inviteResponse.json() as {
      invitation: { id: string };
      token: string;
    };
    expect(issued.token).toBeTypeOf("string");
    expect(issued.token.length).toBeGreaterThan(20);

    // The invitation is listed as pending for the owner.
    const pending = await app.inject({
      headers: { cookie: ownerSession.cookie },
      method: "GET",
      url: `/workspaces/${workspaceId}/invitations`
    });
    expect(pending.statusCode).toBe(200);
    expect(pending.json()).toEqual([
      expect.objectContaining({
        invitedEmail: inviteeEmail,
        status: "pending"
      })
    ]);

    // The invitee signs up, then accepts.
    const inviteeSession = await signupSessionViaInject(app, {
      displayName: "Membership Invitee",
      email: inviteeEmail
    });

    const acceptResponse = await app.inject({
      headers: { cookie: inviteeSession.cookie },
      method: "POST",
      payload: { token: issued.token },
      url: "/invitations/accept"
    });
    expect(acceptResponse.statusCode).toBe(200);
    expect(acceptResponse.json()).toMatchObject({
      acceptedUserId: inviteeSession.user.id,
      status: "accepted",
      workspaceId
    });

    // Owner now sees both users as members.
    const finalMembers = await app.inject({
      headers: { cookie: ownerSession.cookie },
      method: "GET",
      url: `/workspaces/${workspaceId}/members`
    });
    expect(finalMembers.statusCode).toBe(200);
    expect(finalMembers.json()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: "owner",
          userId: ownerSession.user.id
        }),
        expect.objectContaining({
          role: "member",
          userId: inviteeSession.user.id
        })
      ])
    );

    // Re-accepting the same token is rejected.
    const replay = await app.inject({
      headers: { cookie: inviteeSession.cookie },
      method: "POST",
      payload: { token: issued.token },
      url: "/invitations/accept"
    });
    expect(replay.statusCode).toBe(400);
  });
});

async function clearMembershipFixtures(client: Client): Promise<void> {
  await client.query(
    `DELETE FROM users WHERE email LIKE '${ownerEmailPrefix}-%@example.com'
       OR email LIKE '${inviteeEmailPrefix}-%@example.com'`
  );
}
