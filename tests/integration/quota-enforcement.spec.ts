import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { Client } from "pg";

import { createApp } from "../../apps/api/src/main.js";
import { QuotaService } from "../../apps/api/src/modules/quota/quota.service.js";

const workspaceId = "workspace_quota_integration";

async function clearQuotaRows(client: Client): Promise<void> {
  await client.query("DELETE FROM workspace_provider_quota_periods WHERE workspace_id = $1", [
    workspaceId
  ]);
}

describe("quota enforcement integration", () => {
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

  it("persists workspace/provider usage in distinct period rows as periods roll forward", async () => {
    quotaService.configure({
      codex: {
        limit: 3,
        periodMs: 60_000
      }
    });

    await quotaService.consumePlatformQuota({
      now: new Date("2026-05-22T10:00:10.000Z"),
      provider: "codex",
      workspaceId
    });
    await quotaService.consumePlatformQuota({
      now: new Date("2026-05-22T10:01:10.000Z"),
      provider: "codex",
      workspaceId
    });

    const rows = await client.query<{
      consumed_units: number;
      period_ends_at: Date;
      period_started_at: Date;
      provider: string;
      quota_limit: number;
      renews_at: Date;
      workspace_id: string;
    }>(
      `
        SELECT
          workspace_id,
          provider,
          period_started_at,
          period_ends_at,
          renews_at,
          quota_limit,
          consumed_units
        FROM workspace_provider_quota_periods
        WHERE workspace_id = $1 AND provider = 'codex'
        ORDER BY period_started_at ASC
      `,
      [workspaceId]
    );

    expect(rows.rows).toHaveLength(2);
    expect(rows.rows[0]).toMatchObject({
      consumed_units: 1,
      provider: "codex",
      quota_limit: 3,
      workspace_id: workspaceId
    });
    expect(rows.rows[1]).toMatchObject({
      consumed_units: 1,
      provider: "codex",
      quota_limit: 3,
      workspace_id: workspaceId
    });
    expect(rows.rows[0]?.renews_at).toEqual(rows.rows[0]?.period_ends_at);
    expect(rows.rows[1]?.renews_at).toEqual(rows.rows[1]?.period_ends_at);
  });
});
