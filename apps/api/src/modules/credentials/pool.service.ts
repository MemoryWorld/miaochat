import { createHash, randomUUID } from "node:crypto";

import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import { sql } from "drizzle-orm";

import {
  credentialPoolEntrySchema,
  credentialPoolKeySchema,
  credentialPoolSelectionSchema,
  credentialPoolSelectionInputSchema,
  createCredentialPoolEntryInputSchema,
  type CreateProviderCredentialInput,
  type CredentialPoolEntry,
  type CredentialPoolKey,
  type CredentialPoolSelection,
  type CredentialPoolSelectionInput
} from "@agenthub/contracts";
import { decryptCredentialSecret, encryptCredentialSecret } from "@agenthub/domain";

import { MetricsRegistry } from "../../observability/metrics-registry.service.js";
import { StructuredLogger } from "../../observability/structured-logger.service.js";
import { DatabaseService } from "../database/database.service.js";
import { validateClaudeCodeCredential } from "./providers/claude-code-validator.js";
import { validateCodexCredential } from "./providers/codex-validator.js";
import { validateDeepSeekCredential } from "./providers/deepseek-validator.js";
import { validateHermesCredential } from "./providers/hermes-validator.js";
import { validateOpenClawCredential } from "./providers/openclaw-validator.js";

type CredentialPoolEntryRow = {
  created_at: Date | string;
  credential_source: "platform_managed";
  encrypted_secret: string;
  id: string;
  is_active: boolean;
  label: string;
  provider: CredentialPoolEntry["provider"];
  provider_account_id: string;
  quota_class: string;
  region: string;
  tier: string;
  updated_at: Date | string;
};

@Injectable()
export class CredentialPoolService {
  private readonly encryptionKey =
    process.env.CREDENTIAL_ENCRYPTION_KEY ?? "agenthub-dev-credential-key";

  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(MetricsRegistry) private readonly metrics: MetricsRegistry,
    @Inject(StructuredLogger) private readonly logger: StructuredLogger
  ) {}

  async create(input: unknown): Promise<CredentialPoolEntry> {
    const parsed = createCredentialPoolEntryInputSchema.parse(input);
    const validation = await this.validateProvider(parsed);

    if (!validation.valid) {
      throw new BadRequestException(validation.message ?? "Credential validation failed");
    }

    const result = await this.database.execute<CredentialPoolEntryRow>(sql`
      INSERT INTO credential_pool_entries (
        id,
        provider,
        region,
        tier,
        quota_class,
        credential_source,
        label,
        provider_account_id,
        encrypted_secret,
        is_active
      )
      VALUES (
        ${randomUUID()},
        ${parsed.provider},
        ${parsed.region},
        ${parsed.tier},
        ${parsed.quotaClass},
        'platform_managed',
        ${parsed.label},
        ${validation.providerAccountId},
        ${encryptCredentialSecret(parsed.rawSecret, this.encryptionKey)},
        ${parsed.isActive}
      )
      RETURNING
        id,
        provider,
        region,
        tier,
        quota_class,
        credential_source,
        label,
        provider_account_id,
        encrypted_secret,
        is_active,
        created_at,
        updated_at
    `);

    return mapCredentialPoolEntryRow(result.rows[0]);
  }

  async list(input: unknown): Promise<CredentialPoolEntry[]> {
    const parsed = credentialPoolKeySchema.parse(input);
    const result = await this.database.execute<CredentialPoolEntryRow>(sql`
      SELECT
        id,
        provider,
        region,
        tier,
        quota_class,
        credential_source,
        label,
        provider_account_id,
        encrypted_secret,
        is_active,
        created_at,
        updated_at
      FROM credential_pool_entries
      WHERE provider = ${parsed.provider}
        AND region = ${parsed.region}
        AND tier = ${parsed.tier}
        AND quota_class = ${parsed.quotaClass}
      ORDER BY created_at ASC, id ASC
    `);

    return result.rows.map(mapCredentialPoolEntryRow);
  }

  async hasEntriesForProvider(provider: CredentialPoolEntry["provider"]): Promise<boolean> {
    const result = await this.database.execute<{ exists: boolean }>(sql`
      SELECT EXISTS (
        SELECT 1
        FROM credential_pool_entries
        WHERE provider = ${provider}
          AND is_active = true
      ) AS exists
    `);

    return result.rows[0]?.exists ?? false;
  }

  async select(input: unknown): Promise<CredentialPoolSelection | null> {
    const parsed = credentialPoolSelectionInputSchema.parse(input);
    const candidates = await this.listActiveCandidates(parsed);

    if (candidates.length === 0) {
      this.metrics.incrementCounter("credential_pool_selection_miss_total", selectionLabels(parsed));
      this.logger.warn("credential_pool.selection.miss", {
        ...selectionLabels(parsed),
        workspaceId: parsed.workspaceId
      });
      return null;
    }

    const selectionKey = createSelectionKey(parsed);
    const selectionIndex = computeSelectionIndex(selectionKey, candidates.length);
    const entry = candidates[selectionIndex]!;

    this.metrics.incrementCounter("credential_pool_selection_total", selectionLabels(parsed));
    this.logger.info("credential_pool.selection.resolved", {
      ...selectionLabels(parsed),
      candidateCount: candidates.length,
      selectedCredentialId: entry.id,
      selectionIndex,
      workspaceId: parsed.workspaceId
    });

    return credentialPoolSelectionSchema.parse({
      candidateCount: candidates.length,
      entry,
      selectionIndex,
      selectionKey
    });
  }

  async revealSecret(id: string): Promise<string | null> {
    const result = await this.database.execute<CredentialPoolEntryRow>(sql`
      SELECT
        id,
        provider,
        region,
        tier,
        quota_class,
        credential_source,
        label,
        provider_account_id,
        encrypted_secret,
        is_active,
        created_at,
        updated_at
      FROM credential_pool_entries
      WHERE id = ${id}
    `);

    const row = result.rows[0];
    if (!row) {
      return null;
    }

    return decryptCredentialSecret(row.encrypted_secret, this.encryptionKey);
  }

  private async listActiveCandidates(
    input: CredentialPoolKey | CredentialPoolSelectionInput
  ): Promise<CredentialPoolEntry[]> {
    const result = await this.database.execute<CredentialPoolEntryRow>(sql`
      SELECT
        id,
        provider,
        region,
        tier,
        quota_class,
        credential_source,
        label,
        provider_account_id,
        encrypted_secret,
        is_active,
        created_at,
        updated_at
      FROM credential_pool_entries
      WHERE provider = ${input.provider}
        AND region = ${input.region}
        AND tier = ${input.tier}
        AND quota_class = ${input.quotaClass}
        AND is_active = true
      ORDER BY created_at ASC, id ASC
    `);

    return result.rows.map(mapCredentialPoolEntryRow);
  }

  private validateProvider(input: {
    provider: CreateProviderCredentialInput["provider"];
    providerAccountId: string;
    rawSecret: string;
  }) {
    const payload: CreateProviderCredentialInput = {
      credentialSource: "platform_managed",
      label: "platform-managed",
      provider: input.provider,
      providerAccountId: input.providerAccountId,
      rawSecret: input.rawSecret,
      workspaceId: "platform-managed"
    };

    switch (input.provider) {
      case "claude-code":
        return validateClaudeCodeCredential(payload);
      case "codex":
        return validateCodexCredential(payload);
      case "deepseek":
        return validateDeepSeekCredential(payload);
      case "hermes":
        return validateHermesCredential(payload);
      case "openclaw":
        return validateOpenClawCredential(payload);
    }
  }
}

function mapCredentialPoolEntryRow(row: CredentialPoolEntryRow | undefined): CredentialPoolEntry {
  return credentialPoolEntrySchema.parse({
    createdAt: row?.created_at,
    credentialSource: row?.credential_source,
    encryptedSecret: row?.encrypted_secret,
    id: row?.id,
    isActive: row?.is_active,
    label: row?.label,
    provider: row?.provider,
    providerAccountId: row?.provider_account_id,
    quotaClass: row?.quota_class,
    region: row?.region,
    tier: row?.tier,
    updatedAt: row?.updated_at
  });
}

function selectionLabels(input: CredentialPoolKey | CredentialPoolSelectionInput) {
  return {
    provider: input.provider,
    quota_class: input.quotaClass,
    region: input.region,
    tier: input.tier
  };
}

function createSelectionKey(input: CredentialPoolSelectionInput): string {
  return [
    input.workspaceId,
    input.provider,
    input.region,
    input.tier,
    input.quotaClass
  ].join(":");
}

function computeSelectionIndex(selectionKey: string, candidateCount: number): number {
  const hash = createHash("sha256").update(selectionKey).digest("hex").slice(0, 8);
  return Number.parseInt(hash, 16) % candidateCount;
}
