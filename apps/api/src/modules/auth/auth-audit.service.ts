import { randomUUID } from "node:crypto";

import { Inject, Injectable } from "@nestjs/common";

import type { PoolClient } from "pg";

import { StructuredLogger } from "../../observability/structured-logger.service.js";
import { DatabaseService } from "../database/database.service.js";

export type AuthLoginAuditOutcome = "failed" | "rate_limited" | "succeeded";

export type RecordLoginAttemptInput = {
  email: string;
  failureReason?: string | null;
  ipAddress: string;
  outcome: AuthLoginAuditOutcome;
  userId?: string | null;
};

@Injectable()
export class AuthAuditService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(StructuredLogger) private readonly logger: StructuredLogger
  ) {}

  async recordLoginAttempt(
    input: RecordLoginAttemptInput,
    client?: PoolClient
  ): Promise<void> {
    const normalizedEmail = input.email.trim().toLowerCase();
    const normalizedIpAddress = input.ipAddress.trim() || "unknown";

    const query = client?.query.bind(client) ?? this.database.query.bind(this.database);

    await query(
      `
        INSERT INTO auth_login_audit_events (
          id,
          email,
          user_id,
          ip_address,
          outcome,
          failure_reason
        )
        VALUES ($1, $2, $3, $4, $5, $6)
      `,
      [
        randomUUID(),
        normalizedEmail,
        input.userId ?? null,
        normalizedIpAddress,
        input.outcome,
        input.failureReason ?? null
      ]
    );

    const fields = {
      email: normalizedEmail,
      ipAddress: normalizedIpAddress,
      outcome: input.outcome,
      ...(input.failureReason ? { failureReason: input.failureReason } : {}),
      ...(input.userId ? { userId: input.userId } : {})
    };

    if (input.outcome === "succeeded") {
      this.logger.info("auth.login.succeeded", fields);
      return;
    }

    this.logger.warn(`auth.login.${input.outcome}`, fields);
  }
}
