import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { Client } from "pg";

import { createApp } from "../../apps/api/src/main.js";
import { RateLimitService } from "../../apps/api/src/modules/limits/rate-limit.service.js";
import { signupSessionViaInject } from "../support/auth-session.js";

const workspaceId = "workspace_rate_limit_integration";
const agentId = "agent_rate_limit_mock";
const workerTaskQueue = "worker-task-rate-limit";

async function seedAgent(client: Client, ownerUserId: string): Promise<void> {
  await client.query(
    `
      INSERT INTO custom_agents (
        id,
        avatar_url,
        capability_tags,
        name,
        owner_user_id,
        provider,
        system_prompt,
        tool_bindings,
        workspace_id
      )
      VALUES ($1, null, '[]'::jsonb, 'Rate Limit Mock', $2, 'mock', 'Echo only', '[]'::jsonb, $3)
      ON CONFLICT DO NOTHING
    `,
    [agentId, ownerUserId, workspaceId]
  );
}

async function clearWorkspace(client: Client): Promise<void> {
  await client.query("DELETE FROM conversations WHERE workspace_id = $1", [workspaceId]);
}

async function clearAgents(client: Client): Promise<void> {
  await client.query("DELETE FROM custom_agents WHERE workspace_id = $1", [workspaceId]);
}

describe("rate limit guardrail", () => {
  const originalBackend = process.env.RATE_LIMIT_BACKEND;
  const originalPrefix = process.env.RATE_LIMIT_REDIS_PREFIX;
  const originalRedisUrl = process.env.REDIS_URL;
  const redisPrefix = `agenthub:test:integration-rate-limit:${Date.now()}`;
  let firstApp: NestFastifyApplication;
  let secondApp: NestFastifyApplication;
  let client: Client;
  let authCookie: string;
  let ownerUserId: string;
  let previousWorkerTaskQueue: string | undefined;

  beforeAll(async () => {
    process.env.RATE_LIMIT_BACKEND = "redis";
    process.env.RATE_LIMIT_REDIS_PREFIX = redisPrefix;
    process.env.REDIS_URL ??= "redis://127.0.0.1:6379";
    previousWorkerTaskQueue = process.env.WORKER_TASK_QUEUE;
    process.env.WORKER_TASK_QUEUE = workerTaskQueue;

    client = new Client({
      connectionString:
        process.env.DATABASE_URL ?? "postgres://agenthub:agenthub@localhost:5432/agenthub"
    });
    await client.connect();
    await clearWorkspace(client);
    await clearAgents(client);

    firstApp = await createApp();
    await firstApp.init();
    await firstApp.getHttpAdapter().getInstance().ready();
    firstApp.get(RateLimitService).configure({ limit: 1, windowMs: 60_000 });

    secondApp = await createApp();
    await secondApp.init();
    await secondApp.getHttpAdapter().getInstance().ready();
    secondApp.get(RateLimitService).configure({ limit: 1, windowMs: 60_000 });

    const session = await signupSessionViaInject(firstApp, {
      displayName: "Rate Limit Integration",
      email: `rate-limit-integration-${Date.now()}@example.com`
    });
    authCookie = session.cookie;
    ownerUserId = session.user.id;

    await seedAgent(client, ownerUserId);
  });

  afterAll(async () => {
    await firstApp.get(RateLimitService).reset();
    await secondApp.close();
    await firstApp.close();
    await clearWorkspace(client);
    await clearAgents(client);
    await client.end();

    process.env.WORKER_TASK_QUEUE = previousWorkerTaskQueue;

    if (originalBackend === undefined) {
      delete process.env.RATE_LIMIT_BACKEND;
    } else {
      process.env.RATE_LIMIT_BACKEND = originalBackend;
    }

    if (originalPrefix === undefined) {
      delete process.env.RATE_LIMIT_REDIS_PREFIX;
    } else {
      process.env.RATE_LIMIT_REDIS_PREFIX = originalPrefix;
    }

    if (originalRedisUrl === undefined) {
      delete process.env.REDIS_URL;
    } else {
      process.env.REDIS_URL = originalRedisUrl;
    }
  });

  it("returns a structured 429 response across app instances after the shared bucket is exceeded", async () => {
    const conversationResponse = await firstApp.inject({
      headers: {
        cookie: authCookie
      },
      method: "POST",
      payload: {
        agentIds: [agentId],
        mode: "direct",
        workspaceId
      },
      url: "/conversations"
    });
    expect(conversationResponse.statusCode).toBe(201);
    const conversationId = conversationResponse.json().id as string;

    const firstSend = await firstApp.inject({
      headers: {
        cookie: authCookie
      },
      method: "POST",
      payload: {
        content: "first request",
        conversationId,
        role: "user",
        workspaceId
      },
      url: "/messages/send"
    });
    expect(firstSend.statusCode).toBe(202);

    const secondSend = await secondApp.inject({
      headers: {
        cookie: authCookie
      },
      method: "POST",
      payload: {
        content: "second request",
        conversationId,
        role: "user",
        workspaceId
      },
      url: "/messages/send"
    });
    expect(secondSend.statusCode).toBe(429);
    expect(secondSend.json()).toEqual(
      expect.objectContaining({
        code: "rate_limited",
        message: expect.stringContaining("too quickly"),
        retryAfterMs: expect.any(Number)
      })
    );
  });
});
