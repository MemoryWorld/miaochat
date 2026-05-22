import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { Client } from "pg";

import { createApp } from "../../apps/api/src/main.js";

const workspaceId = "workspace_auth_ownership";
const aliceEmail = "auth.ownership.alice@example.com";
const bobEmail = "auth.ownership.bob@example.com";
const password = "S3curePass!123";

describe("authenticated ownership integration", () => {
  let app: NestFastifyApplication;
  let client: Client;

  beforeAll(async () => {
    client = new Client({
      connectionString:
        process.env.DATABASE_URL ?? "postgres://agenthub:agenthub@localhost:5432/agenthub"
    });
    await client.connect();
    await clearWorkspace(client);
    await clearUsers(client);

    app = await createApp();
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterEach(async () => {
    await clearWorkspace(client);
    await clearUsers(client);
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }

    await clearWorkspace(client);
    await clearUsers(client);
    await client.end();
  });

  it("keeps custom agents, credentials, conversations, and messages scoped to the authenticated user", async () => {
    const aliceSession = await signupAndGetSessionCookie(app, {
      displayName: "Alice Ownership",
      email: aliceEmail
    });
    const bobSession = await signupAndGetSessionCookie(app, {
      displayName: "Bob Ownership",
      email: bobEmail
    });

    const aliceWorkspace = await app.inject({
      headers: { cookie: aliceSession.cookie },
      method: "POST",
      payload: { id: workspaceId, name: "Alice Ownership Workspace" },
      url: "/workspaces"
    });
    expect(aliceWorkspace.statusCode).toBe(201);

    const agentResponse = await app.inject({
      headers: {
        cookie: aliceSession.cookie
      },
      method: "POST",
      payload: {
        capabilityTags: ["planning"],
        name: "Alice Planner",
        provider: "mock",
        systemPrompt: "Plan only for Alice.",
        toolBindings: [],
        workspaceId
      },
      url: "/custom-agents"
    });

    expect(agentResponse.statusCode).toBe(201);
    expect(agentResponse.json()).toMatchObject({
      name: "Alice Planner",
      ownerUserId: aliceSession.user.id
    });

    const credentialResponse = await app.inject({
      headers: {
        cookie: aliceSession.cookie
      },
      method: "POST",
      payload: {
        label: "Alice Codex",
        provider: "codex",
        providerAccountId: "acct_alice_codex",
        rawSecret: "sk-alice-codex-secret",
        workspaceId
      },
      url: "/credentials"
    });

    expect(credentialResponse.statusCode).toBe(201);
    expect(credentialResponse.json()).toMatchObject({
      label: "Alice Codex",
      ownerUserId: aliceSession.user.id
    });

    const conversationResponse = await app.inject({
      headers: {
        cookie: aliceSession.cookie
      },
      method: "POST",
      payload: {
        agentIds: [agentResponse.json().id as string],
        mode: "direct",
        workspaceId
      },
      url: "/conversations"
    });

    expect(conversationResponse.statusCode).toBe(201);
    expect(conversationResponse.json()).toMatchObject({
      ownerUserId: aliceSession.user.id
    });
    const conversationId = conversationResponse.json().id as string;

    const messageResponse = await app.inject({
      headers: {
        cookie: aliceSession.cookie
      },
      method: "POST",
      payload: {
        content: "Alice only note",
        conversationId,
        role: "user",
        workspaceId
      },
      url: "/messages"
    });

    expect(messageResponse.statusCode).toBe(201);
    expect(messageResponse.json()).toMatchObject({
      content: "Alice only note",
      ownerUserId: aliceSession.user.id
    });

    const bobAgents = await app.inject({
      headers: {
        cookie: bobSession.cookie
      },
      method: "GET",
      url: `/custom-agents?workspaceId=${workspaceId}`
    });
    expect(bobAgents.statusCode).toBe(200);
    expect(bobAgents.json()).toEqual([]);

    const bobCredentials = await app.inject({
      headers: {
        cookie: bobSession.cookie
      },
      method: "GET",
      url: `/credentials?workspaceId=${workspaceId}`
    });
    expect(bobCredentials.statusCode).toBe(200);
    expect(bobCredentials.json()).toEqual([]);

    const bobConversations = await app.inject({
      headers: {
        cookie: bobSession.cookie
      },
      method: "GET",
      url: `/conversations?workspaceId=${workspaceId}`
    });
    expect(bobConversations.statusCode).toBe(200);
    expect(bobConversations.json()).toEqual([]);

    const bobMessages = await app.inject({
      headers: {
        cookie: bobSession.cookie
      },
      method: "GET",
      url: `/messages?conversationId=${conversationId}&workspaceId=${workspaceId}`
    });
    expect(bobMessages.statusCode).toBe(404);
  });
});

async function clearUsers(client: Client): Promise<void> {
  await client.query(
    "DELETE FROM users WHERE email LIKE 'auth.ownership.%@example.com'"
  );
}

async function clearWorkspace(client: Client): Promise<void> {
  await client.query("DELETE FROM conversations WHERE workspace_id = $1", [workspaceId]);
  await client.query("DELETE FROM provider_credentials WHERE workspace_id = $1", [workspaceId]);
  await client.query("DELETE FROM custom_agents WHERE workspace_id = $1", [workspaceId]);
}

async function signupAndGetSessionCookie(
  app: NestFastifyApplication,
  input: {
    displayName: string;
    email: string;
  }
): Promise<{
  cookie: string;
  user: {
    email: string;
    id: string;
  };
}> {
  const response = await app.inject({
    method: "POST",
    payload: {
      ...input,
      password
    },
    url: "/auth/signup"
  });

  expect(response.statusCode).toBe(201);

  return {
    cookie: extractCookie(response.headers["set-cookie"]),
    user: response.json().user as {
      email: string;
      id: string;
    }
  };
}

function extractCookie(header: string | string[] | undefined): string {
  if (Array.isArray(header)) {
    return header[0] ?? "";
  }

  return header ?? "";
}
