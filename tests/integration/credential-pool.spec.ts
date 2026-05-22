import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { Client } from "pg";

import { createApp } from "../../apps/api/src/main.js";
import { CredentialPoolService } from "../../apps/api/src/modules/credentials/pool.service.js";

const poolKey = {
  provider: "codex",
  quotaClass: "standard",
  region: "us-east-1",
  tier: "shared"
} as const;

async function clearPool(client: Client): Promise<void> {
  await client.query("DELETE FROM credential_pool_entries");
}

describe("credential pool integration", () => {
  let app: NestFastifyApplication;
  let client: Client;
  let poolService: CredentialPoolService;

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
  });

  afterEach(async () => {
    await clearPool(client);
  });

  afterAll(async () => {
    await app.close();
    await clearPool(client);
    await client.end();
  });

  it("persists encrypted platform-managed credentials and scopes lookup by pool key", async () => {
    const selectedEntry = await poolService.create({
      ...poolKey,
      label: "Codex Shared East Primary",
      providerAccountId: "acct_pool_primary",
      rawSecret: "sk-platform-primary"
    });
    await poolService.create({
      provider: "codex",
      quotaClass: "burst",
      region: "us-east-1",
      tier: "shared",
      label: "Codex Burst East",
      providerAccountId: "acct_pool_burst",
      rawSecret: "sk-platform-burst"
    });

    const row = await client.query<{
      credential_source: string;
      encrypted_secret: string;
      provider: string;
      quota_class: string;
      region: string;
      tier: string;
    }>(
      `
        SELECT
          credential_source,
          encrypted_secret,
          provider,
          quota_class,
          region,
          tier
        FROM credential_pool_entries
        WHERE id = $1
      `,
      [selectedEntry.id]
    );

    expect(row.rows[0]?.credential_source).toBe("platform_managed");
    expect(row.rows[0]?.provider).toBe("codex");
    expect(row.rows[0]?.region).toBe("us-east-1");
    expect(row.rows[0]?.tier).toBe("shared");
    expect(row.rows[0]?.quota_class).toBe("standard");
    expect(row.rows[0]?.encrypted_secret).toBeTruthy();
    expect(row.rows[0]?.encrypted_secret).not.toContain("sk-platform-primary");

    await expect(poolService.list(poolKey)).resolves.toEqual([selectedEntry]);

    const selection = await poolService.select({
      ...poolKey,
      workspaceId: "workspace_release_platform"
    });

    expect(selection?.entry.id).toBe(selectedEntry.id);
    expect(selection?.candidateCount).toBe(1);
    await expect(poolService.revealSecret(selectedEntry.id)).resolves.toBe(
      "sk-platform-primary"
    );
  });
});
