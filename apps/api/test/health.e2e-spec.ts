import { afterEach, describe, expect, it } from "vitest";

import type { NestFastifyApplication } from "@nestjs/platform-fastify";

import { createApp } from "../src/main.js";

describe("api health", () => {
  let app: NestFastifyApplication | undefined;

  afterEach(async () => {
    await app?.close();
  });

  it("returns health and readiness information", async () => {
    app = await createApp();
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    const response = await app.inject({
      method: "GET",
      url: "/health"
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      service: "api",
      status: "ok"
    });
  });

  it("reports runtime health separately from API liveness", async () => {
    const originalPath = process.env.PATH;
    process.env.PATH = "/tmp/miaochat-no-opencode";

    try {
      app = await createApp();
      await app.init();
      await app.getHttpAdapter().getInstance().ready();

      const response = await app.inject({
        method: "GET",
        url: "/health/runtime"
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        opencode: {
          cli: "missing"
        },
        service: "api",
        status: "degraded",
        worker: {
          status: "configured",
          taskQueue: "agenthub-default"
        }
      });
    } finally {
      process.env.PATH = originalPath;
    }
  });
});
