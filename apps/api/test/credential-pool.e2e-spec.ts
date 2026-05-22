import { PassThrough } from "node:stream";

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { Client } from "pg";

import { createApp } from "../src/main.js";
import { CredentialPoolService } from "../src/modules/credentials/pool.service.js";
import { MetricsRegistry } from "../src/observability/metrics-registry.service.js";
import { StructuredLogger } from "../src/observability/structured-logger.service.js";

const poolKey = {
  provider: "codex",
  quotaClass: "standard",
  region: "us-west-2",
  tier: "shared"
} as const;

async function clearPool(client: Client): Promise<void> {
  await client.query(
    "DELETE FROM credential_pool_entries WHERE label LIKE 'Codex Shared East %'"
  );
}

describe("credential pool service", () => {
  let app: NestFastifyApplication;
  let client: Client;
  let logStream: PassThrough;
  let poolService: CredentialPoolService;
  let rawLogs = "";

  beforeAll(async () => {
    client = new Client({
      connectionString:
        process.env.DATABASE_URL ?? "postgres://agenthub:agenthub@localhost:5432/agenthub"
    });
    await client.connect();
    await clearPool(client);

    app = await createApp();
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    poolService = app.get(CredentialPoolService);

    logStream = new PassThrough();
    logStream.on("data", (chunk: Buffer | string) => {
      rawLogs += chunk.toString();
    });
    Reflect.set(app.get(StructuredLogger) as object, "stream", logStream);
  });

  beforeEach(() => {
    rawLogs = "";
    app.get(MetricsRegistry).reset();
  });

  afterEach(async () => {
    await clearPool(client);
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }

    logStream?.end();

    if (client) {
      await clearPool(client);
      await client.end();
    }
  });

  it("selects a deterministic platform-managed credential and emits observability signals", async () => {
    const first = await poolService.create({
      ...poolKey,
      label: "Codex Shared East A",
      providerAccountId: "acct_pool_a",
      rawSecret: "sk-pool-a"
    });
    const second = await poolService.create({
      ...poolKey,
      label: "Codex Shared East B",
      providerAccountId: "acct_pool_b",
      rawSecret: "sk-pool-b"
    });

    const firstSelection = await poolService.select({
      ...poolKey,
      workspaceId: "workspace_alpha"
    });
    const secondSelection = await poolService.select({
      ...poolKey,
      workspaceId: "workspace_alpha"
    });

    expect(firstSelection).not.toBeNull();
    expect(secondSelection).toEqual(firstSelection);
    expect([first.id, second.id]).toContain(firstSelection?.entry.id);
    expect(firstSelection?.candidateCount).toBe(2);

    expect(app.get(MetricsRegistry).snapshot().counters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          labels: expect.objectContaining({
            provider: "codex",
            quota_class: "standard",
            region: "us-west-2",
            tier: "shared"
          }),
          name: "credential_pool_selection_total",
          value: 2
        })
      ])
    );

    expect(rawLogs).toContain("\"event\":\"credential_pool.selection.resolved\"");
    expect(rawLogs).toContain(`"selectedCredentialId":"${firstSelection?.entry.id}"`);
  });

  it("records an observable miss when a pool key has no active credentials", async () => {
    await expect(
      poolService.select({
        ...poolKey,
        workspaceId: "workspace_missing"
      })
    ).resolves.toBeNull();

    expect(app.get(MetricsRegistry).snapshot().counters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          labels: expect.objectContaining({
            provider: "codex",
            quota_class: "standard",
            region: "us-west-2",
            tier: "shared"
          }),
          name: "credential_pool_selection_miss_total",
          value: 1
        })
      ])
    );
    expect(rawLogs).toContain("\"event\":\"credential_pool.selection.miss\"");
  });
});
