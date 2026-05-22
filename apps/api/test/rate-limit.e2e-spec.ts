import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { NestFastifyApplication } from "@nestjs/platform-fastify";

import { createApp } from "../src/main.js";
import { RateLimitService } from "../src/modules/limits/rate-limit.service.js";

describe("redis-backed rate limiting", () => {
  const originalBackend = process.env.RATE_LIMIT_BACKEND;
  const originalPrefix = process.env.RATE_LIMIT_REDIS_PREFIX;
  const originalRedisUrl = process.env.REDIS_URL;
  const redisPrefix = `agenthub:test:rate-limit:${Date.now()}`;
  let firstApp: NestFastifyApplication;
  let secondApp: NestFastifyApplication;

  beforeAll(async () => {
    process.env.RATE_LIMIT_BACKEND = "redis";
    process.env.RATE_LIMIT_REDIS_PREFIX = redisPrefix;
    process.env.REDIS_URL ??= "redis://127.0.0.1:6379";

    firstApp = await createApp();
    await firstApp.init();
    await firstApp.getHttpAdapter().getInstance().ready();

    secondApp = await createApp();
    await secondApp.init();
    await secondApp.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await firstApp?.get(RateLimitService).reset();
    await secondApp?.close();
    await firstApp?.close();

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

  it("shares bucket state across app instances", async () => {
    const firstService = firstApp.get(RateLimitService);
    const secondService = secondApp.get(RateLimitService);

    firstService.configure({ limit: 1, windowMs: 60_000 });
    secondService.configure({ limit: 1, windowMs: 60_000 });

    const firstResult = await firstService.consume({
      key: "workspace_shared:conversation_shared"
    });
    const secondResult = await secondService.consume({
      key: "workspace_shared:conversation_shared"
    });

    expect(firstResult).toEqual({
      allowed: true,
      remaining: 0,
      retryAfterMs: 0
    });
    expect(secondResult).toEqual(
      expect.objectContaining({
        allowed: false,
        remaining: 0,
        retryAfterMs: expect.any(Number)
      })
    );
    expect(secondResult.retryAfterMs).toBeGreaterThan(0);
  });
});
