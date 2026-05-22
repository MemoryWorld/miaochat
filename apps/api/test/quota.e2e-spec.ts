import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { Client } from "pg";

import { mapToPublicError } from "@agenthub/domain";

import { createApp } from "../src/main.js";
import {
  QuotaExceededError,
  QuotaService
} from "../src/modules/quota/quota.service.js";

const workspaceId = "workspace_quota_e2e";

async function clearQuotaRows(client: Client): Promise<void> {
  await client.query("DELETE FROM workspace_provider_quota_periods WHERE workspace_id = $1", [
    workspaceId
  ]);
}

describe("quota service", () => {
  let app: NestFastifyApplication;
  let client: Client;
  let quotaService: QuotaService;

  beforeAll(async () => {
    client = new Client({
      connectionString:
        process.env.DATABASE_URL ?? "postgres://agenthub:agenthub@localhost:5432/agenthub"
    });
    await client.connect();
    await clearQuotaRows(client);

    app = await createApp();
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    quotaService = app.get(QuotaService);
  });

  afterEach(async () => {
    quotaService.reset();
    await clearQuotaRows(client);
  });

  afterAll(async () => {
    await app.close();
    await clearQuotaRows(client);
    await client.end();
  });

  it("records usage in the active period and exposes due renewals", async () => {
    quotaService.configure({
      codex: {
        limit: 2,
        periodMs: 60_000
      }
    });

    const first = await quotaService.consumePlatformQuota({
      now: new Date("2026-05-22T10:00:10.000Z"),
      provider: "codex",
      workspaceId
    });
    const second = await quotaService.consumePlatformQuota({
      now: new Date("2026-05-22T10:00:40.000Z"),
      provider: "codex",
      workspaceId
    });

    expect(first.consumedUnits).toBe(1);
    expect(second.consumedUnits).toBe(2);
    await expect(
      quotaService.listScheduledRenewals(new Date("2026-05-22T10:01:01.000Z"))
    ).resolves.toEqual([
      expect.objectContaining({
        provider: "codex",
        workspaceId
      })
    ]);
  });

  it("maps quota breaches to a quota_exceeded public error", async () => {
    quotaService.configure({
      codex: {
        limit: 1,
        periodMs: 60_000
      }
    });

    await quotaService.consumePlatformQuota({
      now: new Date("2026-05-22T10:00:00.000Z"),
      provider: "codex",
      workspaceId
    });

    let thrown: unknown;
    try {
      await quotaService.consumePlatformQuota({
        now: new Date("2026-05-22T10:00:30.000Z"),
        provider: "codex",
        workspaceId
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(QuotaExceededError);
    expect(mapToPublicError(thrown)).toEqual(
      expect.objectContaining({
        code: "quota_exceeded",
        status: 429
      })
    );
  });
});
