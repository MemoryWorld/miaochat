import { randomUUID } from "node:crypto";

import { Inject, Injectable } from "@nestjs/common";

import { workspaceIdSchema } from "@agenthub/contracts";
import { z } from "zod";

import { DatabaseService } from "../database/database.service.js";
import { MetricsRegistry } from "../../observability/metrics-registry.service.js";
import { StructuredLogger } from "../../observability/structured-logger.service.js";

const quotaProviderSchema = z.enum([
  "claude-code",
  "codex",
  "deepseek",
  "hermes",
  "openclaw"
]);

const consumePlatformQuotaInputSchema = z.object({
  now: z.coerce.date().optional(),
  provider: quotaProviderSchema,
  quotaClass: z.string().trim().min(1).max(64).default("standard"),
  units: z.number().int().positive().default(1),
  workspaceId: workspaceIdSchema
});

const quotaPeriodSchema = z.object({
  consumedUnits: z.number().int().nonnegative(),
  createdAt: z.coerce.date(),
  id: z.string().min(1),
  periodEndsAt: z.coerce.date(),
  periodStartedAt: z.coerce.date(),
  provider: quotaProviderSchema,
  quotaClass: z.string().min(1),
  quotaLimit: z.number().int().positive(),
  renewsAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  workspaceId: workspaceIdSchema
});

type QuotaProvider = z.infer<typeof quotaProviderSchema>;
type QuotaPolicy = {
  limit: number;
  periodMs: number;
};
type ConsumePlatformQuotaInput = z.infer<typeof consumePlatformQuotaInputSchema>;
type WorkspaceProviderQuotaPeriod = z.infer<typeof quotaPeriodSchema>;

type WorkspaceProviderQuotaPeriodRow = {
  consumed_units: number;
  created_at: Date | string;
  id: string;
  period_ends_at: Date | string;
  period_started_at: Date | string;
  provider: QuotaProvider;
  quota_class: string;
  quota_limit: number;
  renews_at: Date | string;
  updated_at: Date | string;
  workspace_id: string;
};

const defaultPolicies: Record<QuotaProvider, QuotaPolicy> = {
  "claude-code": {
    limit: 1_000,
    periodMs: 30 * 24 * 60 * 60 * 1_000
  },
  codex: {
    limit: 1_000,
    periodMs: 30 * 24 * 60 * 60 * 1_000
  },
  deepseek: {
    limit: 1_000,
    periodMs: 30 * 24 * 60 * 60 * 1_000
  },
  hermes: {
    limit: 1_000,
    periodMs: 30 * 24 * 60 * 60 * 1_000
  },
  openclaw: {
    limit: 1_000,
    periodMs: 30 * 24 * 60 * 60 * 1_000
  }
};

export class QuotaExceededError extends Error {
  readonly code = "quota_exceeded" as const;

  constructor(message = "Workspace quota exceeded for this provider in the current period.") {
    super(message);
    this.name = "QuotaExceededError";
  }
}

@Injectable()
export class QuotaService {
  private policies: Record<QuotaProvider, QuotaPolicy> = { ...defaultPolicies };

  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(MetricsRegistry) private readonly metrics: MetricsRegistry,
    @Inject(StructuredLogger) private readonly logger: StructuredLogger
  ) {}

  configure(policies: Partial<Record<QuotaProvider, QuotaPolicy>>): void {
    this.policies = {
      ...this.policies,
      ...policies
    };
  }

  hasPolicy(provider: QuotaProvider): boolean {
    return provider in this.policies;
  }

  reset(): void {
    this.policies = { ...defaultPolicies };
  }

  async consumePlatformQuota(input: unknown): Promise<WorkspaceProviderQuotaPeriod> {
    const parsed = consumePlatformQuotaInputSchema.parse(input);
    const policy = this.policies[parsed.provider];
    const period = resolvePeriodBounds(parsed.now ?? new Date(), policy.periodMs);

    return this.database.withClient(async (client) => {
      await client.query("BEGIN");

      try {
        await client.query(
          `
            INSERT INTO workspace_provider_quota_periods (
              id,
              workspace_id,
              provider,
              quota_class,
              period_started_at,
              period_ends_at,
              renews_at,
              quota_limit,
              consumed_units
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 0)
            ON CONFLICT (workspace_id, provider, quota_class, period_started_at) DO NOTHING
          `,
          [
            randomUUID(),
            parsed.workspaceId,
            parsed.provider,
            parsed.quotaClass,
            period.periodStartedAt,
            period.periodEndsAt,
            period.renewsAt,
            policy.limit
          ]
        );

        const currentPeriod = await client.query<WorkspaceProviderQuotaPeriodRow>(
          `
            SELECT
              id,
              workspace_id,
              provider,
              quota_class,
              period_started_at,
              period_ends_at,
              renews_at,
              quota_limit,
              consumed_units,
              created_at,
              updated_at
            FROM workspace_provider_quota_periods
            WHERE workspace_id = $1
              AND provider = $2
              AND quota_class = $3
              AND period_started_at = $4
            FOR UPDATE
          `,
          [parsed.workspaceId, parsed.provider, parsed.quotaClass, period.periodStartedAt]
        );

        const row = currentPeriod.rows[0];
        const current = mapQuotaPeriodRow(row);

        if (current.consumedUnits + parsed.units > current.quotaLimit) {
          this.metrics.incrementCounter("workspace_quota_exceeded_total", quotaLabels(parsed));
          this.logger.warn("workspace.quota.exceeded", {
            ...quotaLabels(parsed),
            consumedUnits: current.consumedUnits,
            quotaLimit: current.quotaLimit,
            requestedUnits: parsed.units,
            workspaceId: parsed.workspaceId
          });
          throw new QuotaExceededError();
        }

        const updated = await client.query<WorkspaceProviderQuotaPeriodRow>(
          `
            UPDATE workspace_provider_quota_periods
            SET
              consumed_units = consumed_units + $2,
              updated_at = now()
            WHERE id = $1
            RETURNING
              id,
              workspace_id,
              provider,
              quota_class,
              period_started_at,
              period_ends_at,
              renews_at,
              quota_limit,
              consumed_units,
              created_at,
              updated_at
          `,
          [current.id, parsed.units]
        );

        await client.query("COMMIT");

        this.metrics.incrementCounter(
          "workspace_quota_consumed_total",
          quotaLabels(parsed),
          parsed.units
        );
        this.logger.info("workspace.quota.consumed", {
          ...quotaLabels(parsed),
          requestedUnits: parsed.units,
          workspaceId: parsed.workspaceId
        });

        return mapQuotaPeriodRow(updated.rows[0]);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    });
  }

  async listScheduledRenewals(at = new Date()): Promise<WorkspaceProviderQuotaPeriod[]> {
    const result = await this.database.query<WorkspaceProviderQuotaPeriodRow>(
      `
        SELECT
          id,
          workspace_id,
          provider,
          quota_class,
          period_started_at,
          period_ends_at,
          renews_at,
          quota_limit,
          consumed_units,
          created_at,
          updated_at
        FROM workspace_provider_quota_periods
        WHERE renews_at <= $1
        ORDER BY renews_at ASC, workspace_id ASC
      `,
      [at]
    );

    return result.rows.map(mapQuotaPeriodRow);
  }
}

function mapQuotaPeriodRow(
  row: WorkspaceProviderQuotaPeriodRow | undefined
): WorkspaceProviderQuotaPeriod {
  return quotaPeriodSchema.parse({
    consumedUnits: row?.consumed_units,
    createdAt: row?.created_at,
    id: row?.id,
    periodEndsAt: row?.period_ends_at,
    periodStartedAt: row?.period_started_at,
    provider: row?.provider,
    quotaClass: row?.quota_class,
    quotaLimit: row?.quota_limit,
    renewsAt: row?.renews_at,
    updatedAt: row?.updated_at,
    workspaceId: row?.workspace_id
  });
}

function quotaLabels(input: ConsumePlatformQuotaInput) {
  return {
    provider: input.provider,
    quota_class: input.quotaClass,
    workspace_id: input.workspaceId
  };
}

function resolvePeriodBounds(now: Date, periodMs: number): {
  periodEndsAt: Date;
  periodStartedAt: Date;
  renewsAt: Date;
} {
  const currentTime = now.getTime();
  const periodStartMs = Math.floor(currentTime / periodMs) * periodMs;
  const periodEndMs = periodStartMs + periodMs;

  return {
    periodEndsAt: new Date(periodEndMs),
    periodStartedAt: new Date(periodStartMs),
    renewsAt: new Date(periodEndMs)
  };
}
