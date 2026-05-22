import { PassThrough } from "node:stream";

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { Client } from "pg";

import { createApp } from "../../apps/api/src/main.js";
import {
  AuthRateLimitService,
  type AuthRateLimitConfig
} from "../../apps/api/src/modules/auth/auth-rate-limit.service.js";
import { StructuredLogger } from "../../apps/api/src/observability/structured-logger.service.js";

const password = "S3curePass!123";
const loginIp = "198.51.100.10";
const secondLoginIp = "198.51.100.11";
const passwordResetIp = "198.51.100.12";
const secondPasswordResetIp = "198.51.100.13";
const testWindowMs = 60_000;

const relaxedRateLimitConfig: AuthRateLimitConfig = {
  login: {
    email: {
      limit: 10,
      windowMs: testWindowMs
    },
    ip: {
      limit: 10,
      windowMs: testWindowMs
    }
  },
  passwordReset: {
    email: {
      limit: 10,
      windowMs: testWindowMs
    },
    ip: {
      limit: 10,
      windowMs: testWindowMs
    }
  }
};

describe("auth rate-limit and audit integration", () => {
  let app: NestFastifyApplication;
  let client: Client;
  let authRateLimitService: AuthRateLimitService;
  let logStream: PassThrough;
  let rawLogs = "";

  beforeAll(async () => {
    client = new Client({
      connectionString:
        process.env.DATABASE_URL ?? "postgres://agenthub:agenthub@localhost:5432/agenthub"
    });
    await client.connect();
    await clearAuthTestRows(client);

    app = await createApp();
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    authRateLimitService = app.get(AuthRateLimitService);
    authRateLimitService.configure(relaxedRateLimitConfig);

    logStream = new PassThrough();
    logStream.on("data", (chunk: Buffer | string) => {
      rawLogs += chunk.toString();
    });
    Reflect.set(app.get(StructuredLogger) as object, "stream", logStream);
  });

  beforeEach(() => {
    rawLogs = "";
  });

  afterEach(async () => {
    await authRateLimitService.reset();
    authRateLimitService.configure(relaxedRateLimitConfig);
    await clearAuthTestRows(client);
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }

    logStream?.end();

    if (client) {
      await clearAuthTestRows(client);
      await client.end();
    }
  });

  it("rate-limits login attempts per IP even when the email changes", async () => {
    await signup("auth.rate-limit.ip.alice@example.com");
    await signup("auth.rate-limit.ip.bob@example.com");
    authRateLimitService.configure({
      login: {
        email: {
          limit: 10,
          windowMs: testWindowMs
        },
        ip: {
          limit: 1,
          windowMs: testWindowMs
        }
      }
    });

    const firstLogin = await login("auth.rate-limit.ip.alice@example.com", loginIp);
    expect(firstLogin.statusCode).toBe(200);

    const secondLogin = await login("auth.rate-limit.ip.bob@example.com", loginIp);
    expect(secondLogin.statusCode).toBe(429);
    expect(secondLogin.json()).toEqual(
      expect.objectContaining({
        code: "rate_limited",
        message: expect.any(String),
        retryAfterMs: expect.any(Number)
      })
    );
  });

  it("rate-limits login attempts per email even when the IP changes", async () => {
    await signup("auth.rate-limit.email.alice@example.com");
    authRateLimitService.configure({
      login: {
        email: {
          limit: 1,
          windowMs: testWindowMs
        },
        ip: {
          limit: 10,
          windowMs: testWindowMs
        }
      }
    });

    const firstLogin = await login("auth.rate-limit.email.alice@example.com", loginIp);
    expect(firstLogin.statusCode).toBe(200);

    const secondLogin = await login(
      "auth.rate-limit.email.alice@example.com",
      secondLoginIp
    );
    expect(secondLogin.statusCode).toBe(429);
    expect(secondLogin.json()).toEqual(
      expect.objectContaining({
        code: "rate_limited",
        message: expect.any(String),
        retryAfterMs: expect.any(Number)
      })
    );
  });

  it("rate-limits password-reset requests per IP even when the email changes", async () => {
    await signup("auth.rate-limit.reset-ip.alice@example.com");
    authRateLimitService.configure({
      passwordReset: {
        email: {
          limit: 10,
          windowMs: testWindowMs
        },
        ip: {
          limit: 1,
          windowMs: testWindowMs
        }
      }
    });

    const firstRequest = await requestPasswordReset(
      "auth.rate-limit.reset-ip.alice@example.com",
      passwordResetIp
    );
    expect(firstRequest.statusCode).toBe(202);

    const secondRequest = await requestPasswordReset(
      "auth.rate-limit.reset-ip.unknown@example.com",
      passwordResetIp
    );
    expect(secondRequest.statusCode).toBe(429);
    expect(secondRequest.json()).toEqual(
      expect.objectContaining({
        code: "rate_limited",
        message: expect.any(String),
        retryAfterMs: expect.any(Number)
      })
    );
  });

  it("rate-limits password-reset requests per email even when the IP changes", async () => {
    await signup("auth.rate-limit.reset-email.alice@example.com");
    authRateLimitService.configure({
      passwordReset: {
        email: {
          limit: 1,
          windowMs: testWindowMs
        },
        ip: {
          limit: 10,
          windowMs: testWindowMs
        }
      }
    });

    const firstRequest = await requestPasswordReset(
      "auth.rate-limit.reset-email.alice@example.com",
      passwordResetIp
    );
    expect(firstRequest.statusCode).toBe(202);

    const secondRequest = await requestPasswordReset(
      "auth.rate-limit.reset-email.alice@example.com",
      secondPasswordResetIp
    );
    expect(secondRequest.statusCode).toBe(429);
    expect(secondRequest.json()).toEqual(
      expect.objectContaining({
        code: "rate_limited",
        message: expect.any(String),
        retryAfterMs: expect.any(Number)
      })
    );
  });

  it("records failed login attempts in the audit table and structured log stream", async () => {
    const signupResponse = await signup("auth.rate-limit.audit.alice@example.com");
    expect(signupResponse.statusCode).toBe(201);

    const failedLogin = await app.inject({
      headers: {
        "x-forwarded-for": secondLoginIp
      },
      method: "POST",
      payload: {
        email: "auth.rate-limit.audit.alice@example.com",
        password: "WrongPass!123"
      },
      url: "/auth/login"
    });

    expect(failedLogin.statusCode).toBe(401);
    expect(failedLogin.json()).toEqual(
      expect.objectContaining({
        message: "Invalid email or password."
      })
    );

    const auditRows = await client.query<{
      email: string;
      failure_reason: string | null;
      ip_address: string;
      outcome: string;
      user_id: string | null;
    }>(
      `
        SELECT
          email,
          failure_reason,
          ip_address,
          outcome,
          user_id
        FROM auth_login_audit_events
        WHERE email = $1
        ORDER BY created_at DESC
      `,
      ["auth.rate-limit.audit.alice@example.com"]
    );

    expect(auditRows.rows[0]).toEqual(
      expect.objectContaining({
        email: "auth.rate-limit.audit.alice@example.com",
        failure_reason: "invalid_credentials",
        ip_address: secondLoginIp,
        outcome: "failed",
        user_id: signupResponse.json().user.id
      })
    );

    expect(readStructuredLogs()).toContainEqual(
      expect.objectContaining({
        email: "auth.rate-limit.audit.alice@example.com",
        event: "auth.login.failed",
        failureReason: "invalid_credentials",
        ipAddress: secondLoginIp,
        outcome: "failed"
      })
    );
  });

  async function signup(email: string) {
    return app.inject({
      method: "POST",
      payload: {
        displayName: "Auth Guardrail",
        email,
        password
      },
      url: "/auth/signup"
    });
  }

  async function login(email: string, ipAddress: string) {
    return app.inject({
      headers: {
        "x-forwarded-for": ipAddress
      },
      method: "POST",
      payload: {
        email,
        password
      },
      url: "/auth/login"
    });
  }

  async function requestPasswordReset(email: string, ipAddress: string) {
    return app.inject({
      headers: {
        "x-forwarded-for": ipAddress
      },
      method: "POST",
      payload: {
        email
      },
      url: "/auth/password-reset/request"
    });
  }

  function readStructuredLogs(): Record<string, unknown>[] {
    return rawLogs
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => JSON.parse(line) as Record<string, unknown>);
  }
});

async function clearAuthTestRows(client: Client): Promise<void> {
  await client.query(
    "DELETE FROM auth_login_audit_events WHERE email LIKE 'auth.rate-limit.%@example.com'"
  );
  await client.query("DELETE FROM users WHERE email LIKE 'auth.rate-limit.%@example.com'");
}
