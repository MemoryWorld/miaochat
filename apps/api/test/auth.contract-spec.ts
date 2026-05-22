import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { Client } from "pg";

import {
  apiRequest,
  contractPassword,
  createContractApp,
  createDatabaseClient
} from "./contract-support.js";

const emailPrefix = "auth-contract";

describe("auth api contract", () => {
  let app: NestFastifyApplication;
  let client: Client;

  beforeAll(async () => {
    client = createDatabaseClient();
    await client.connect();
    await clearUsers(client);
    app = await createContractApp();
  });

  afterEach(async () => {
    await clearUsers(client);
  });

  afterAll(async () => {
    await app.close();
    await clearUsers(client);
    await client.end();
  });

  it("issues a session cookie on signup and invalidates it on logout", async () => {
    const signupResponse = await apiRequest(app).post("/auth/signup").send({
      displayName: "Auth Contract",
      email: `${emailPrefix}-${Date.now()}@example.com`,
      password: contractPassword
    });

    expect(signupResponse.status).toBe(201);
    expect(signupResponse.headers["set-cookie"]).toBeDefined();
    expect(signupResponse.body).toEqual(
      expect.objectContaining({
        session: expect.objectContaining({ expiresAt: expect.any(String) }),
        user: expect.objectContaining({ email: expect.stringContaining(emailPrefix) })
      })
    );

    const cookie = extractCookie(signupResponse.headers["set-cookie"]);
    const sessionResponse = await apiRequest(app)
      .get("/auth/session")
      .set("Cookie", cookie);

    expect(sessionResponse.status).toBe(200);
    expect(sessionResponse.body).toEqual(
      expect.objectContaining({
        authenticated: true,
        user: expect.objectContaining({ email: signupResponse.body.user.email })
      })
    );

    const logoutResponse = await apiRequest(app)
      .post("/auth/logout")
      .set("Cookie", cookie);

    expect(logoutResponse.status).toBe(200);
    expect(logoutResponse.body).toEqual({ loggedOut: true });

    const postLogoutSession = await apiRequest(app)
      .get("/auth/session")
      .set("Cookie", cookie);

    expect(postLogoutSession.status).toBe(200);
    expect(postLogoutSession.body).toEqual({ authenticated: false });
  });

  it("rejects an invalid password without issuing a session cookie", async () => {
    const email = `${emailPrefix}-invalid-${Date.now()}@example.com`;
    await apiRequest(app).post("/auth/signup").send({
      displayName: "Auth Contract Invalid",
      email,
      password: contractPassword
    });

    const loginResponse = await apiRequest(app).post("/auth/login").send({
      email,
      password: "WrongPass!123"
    });

    expect(loginResponse.status).toBe(401);
    expect(loginResponse.headers["set-cookie"]).toBeUndefined();
    expect(loginResponse.body).toEqual(
      expect.objectContaining({
        message: "Invalid email or password."
      })
    );
  });
});

async function clearUsers(client: Client): Promise<void> {
  await client.query(
    `DELETE FROM auth_login_audit_events WHERE email LIKE '${emailPrefix}-%@example.com'`
  );
  await client.query(
    `
      DELETE FROM users
      WHERE email LIKE '${emailPrefix}-%@example.com'
    `
  );
}

function extractCookie(header: string | string[] | undefined): string {
  if (Array.isArray(header)) {
    return header[0] ?? "";
  }

  return header ?? "";
}
