import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { Client } from "pg";

import { createApp } from "../../apps/api/src/main.js";

const firstEmail = "auth.integration.alice@example.com";
const secondEmail = "auth.integration.bob@example.com";
const password = "S3curePass!123";

describe("auth integration", () => {
  let app: NestFastifyApplication;
  let client: Client;

  beforeAll(async () => {
    client = new Client({
      connectionString:
        process.env.DATABASE_URL ?? "postgres://agenthub:agenthub@localhost:5432/agenthub"
    });
    await client.connect();
    await clearUsers(client);

    app = await createApp();
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterEach(async () => {
    await clearUsers(client);
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }

    if (client) {
      await clearUsers(client);
      await client.end();
    }
  });

  it("creates a user, stores password credentials, and issues a secure session cookie", async () => {
    const response = await app.inject({
      method: "POST",
      payload: {
        displayName: "Alice",
        email: "Auth.Integration.Alice@Example.com",
        password
      },
      url: "/auth/signup"
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      user: {
        displayName: "Alice",
        email: firstEmail
      }
    });
    expect(response.json()).not.toHaveProperty("password");

    const sessionCookie = extractSessionCookie(response.headers["set-cookie"]);
    expect(sessionCookie).toContain("agenthub_session=");
    expect(sessionCookie).toContain("HttpOnly");
    expect(sessionCookie).toContain("Path=/");
    expect(sessionCookie).toContain("SameSite=Lax");

    const stored = await client.query<{
      email: string;
      display_name: string;
      password_hash: string;
      session_token_hash: string;
    }>(
      `
        SELECT
          users.email,
          users.display_name,
          auth_credentials.password_hash,
          auth_sessions.session_token_hash
        FROM users
        JOIN auth_credentials ON auth_credentials.user_id = users.id
        JOIN auth_sessions ON auth_sessions.user_id = users.id
        WHERE users.email = $1
      `,
      [firstEmail]
    );

    expect(stored.rows[0]?.display_name).toBe("Alice");
    expect(stored.rows[0]?.email).toBe(firstEmail);
    expect(stored.rows[0]?.password_hash).toBeTruthy();
    expect(stored.rows[0]?.password_hash).not.toContain(password);
    expect(stored.rows[0]?.session_token_hash).toBeTruthy();
  });

  it("logs in an existing user and rotates the active session token", async () => {
    const signupResponse = await app.inject({
      method: "POST",
      payload: {
        displayName: "Bob",
        email: secondEmail,
        password
      },
      url: "/auth/signup"
    });

    expect(signupResponse.statusCode).toBe(201);
    const firstSessionToken = readCookieToken(
      extractSessionCookie(signupResponse.headers["set-cookie"])
    );

    const loginResponse = await app.inject({
      method: "POST",
      payload: {
        email: secondEmail,
        password
      },
      url: "/auth/login"
    });

    expect(loginResponse.statusCode).toBe(200);
    expect(loginResponse.json()).toMatchObject({
      user: {
        email: secondEmail
      }
    });

    const secondSessionToken = readCookieToken(
      extractSessionCookie(loginResponse.headers["set-cookie"])
    );
    expect(secondSessionToken).not.toBe(firstSessionToken);

    const sessionState = await client.query<{
      active_sessions: number;
      revoked_sessions: number;
    }>(
      `
        SELECT
          COUNT(*) FILTER (WHERE revoked_at IS NULL)::int AS active_sessions,
          COUNT(*) FILTER (WHERE revoked_at IS NOT NULL)::int AS revoked_sessions
        FROM auth_sessions
        WHERE user_id = (SELECT id FROM users WHERE email = $1)
      `,
      [secondEmail]
    );

    expect(sessionState.rows[0]).toEqual({
      active_sessions: 1,
      revoked_sessions: 1
    });
  });

  it("logs out the current session and clears the session cookie", async () => {
    const signupResponse = await app.inject({
      method: "POST",
      payload: {
        displayName: "Bob",
        email: secondEmail,
        password
      },
      url: "/auth/signup"
    });

    const sessionCookie = extractSessionCookie(signupResponse.headers["set-cookie"]);

    const logoutResponse = await app.inject({
      headers: {
        cookie: sessionCookie
      },
      method: "POST",
      url: "/auth/logout"
    });

    expect(logoutResponse.statusCode).toBe(200);
    expect(logoutResponse.json()).toEqual({
      loggedOut: true
    });
    expect(extractSessionCookie(logoutResponse.headers["set-cookie"])).toContain(
      "Max-Age=0"
    );

    const sessionState = await client.query<{
      active_sessions: number;
      revoked_sessions: number;
    }>(
      `
        SELECT
          COUNT(*) FILTER (WHERE revoked_at IS NULL)::int AS active_sessions,
          COUNT(*) FILTER (WHERE revoked_at IS NOT NULL)::int AS revoked_sessions
        FROM auth_sessions
        WHERE user_id = (SELECT id FROM users WHERE email = $1)
      `,
      [secondEmail]
    );

    expect(sessionState.rows[0]).toEqual({
      active_sessions: 0,
      revoked_sessions: 1
    });
  });

  it("accepts password reset requests without leaking whether the account exists", async () => {
    const signupResponse = await app.inject({
      method: "POST",
      payload: {
        displayName: "Alice",
        email: firstEmail,
        password
      },
      url: "/auth/signup"
    });

    expect(signupResponse.statusCode).toBe(201);

    const existingUserResponse = await app.inject({
      method: "POST",
      payload: {
        email: firstEmail
      },
      url: "/auth/password-reset/request"
    });

    expect(existingUserResponse.statusCode).toBe(202);
    expect(existingUserResponse.json()).toEqual({
      accepted: true
    });

    const credentialState = await client.query<{
      password_reset_requested_at: Date | null;
      password_reset_token_hash: string | null;
    }>(
      `
        SELECT
          password_reset_requested_at,
          password_reset_token_hash
        FROM auth_credentials
        WHERE user_id = (SELECT id FROM users WHERE email = $1)
      `,
      [firstEmail]
    );

    expect(credentialState.rows[0]?.password_reset_requested_at).toBeTruthy();
    expect(credentialState.rows[0]?.password_reset_token_hash).toBeTruthy();

    const unknownUserResponse = await app.inject({
      method: "POST",
      payload: {
        email: "auth.integration.unknown@example.com"
      },
      url: "/auth/password-reset/request"
    });

    expect(unknownUserResponse.statusCode).toBe(202);
    expect(unknownUserResponse.json()).toEqual({
      accepted: true
    });
  });
});

async function clearUsers(client: Client): Promise<void> {
  await client.query(
    "DELETE FROM auth_login_audit_events WHERE email LIKE 'auth.integration.%@example.com'"
  );
  await client.query("DELETE FROM users WHERE email LIKE 'auth.integration.%@example.com'");
}

function extractSessionCookie(
  header: string | string[] | undefined
): string {
  if (Array.isArray(header)) {
    return header[0] ?? "";
  }

  return header ?? "";
}

function readCookieToken(setCookieHeader: string): string {
  const match = setCookieHeader.match(/agenthub_session=([^;]+)/);

  if (!match) {
    throw new Error("Session cookie was not issued.");
  }

  return match[1];
}
