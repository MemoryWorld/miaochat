import { createHash, randomUUID } from "node:crypto";

import { Inject, Injectable } from "@nestjs/common";

import type { PoolClient } from "pg";

import { DatabaseService } from "../database/database.service.js";

export type WorkspaceAuditAction =
  | "conversation.share"
  | "credential.read"
  | "credential.revoke"
  | "member.invite"
  | "member.invitation.accepted"
  | "member.invitation.revoked"
  | "role.change"
  | "workspace.create";

export type WorkspaceAuditEvent = {
  action: WorkspaceAuditAction;
  actorUserId: string;
  createdAt: Date;
  details: Record<string, unknown>;
  eventHash: string;
  id: string;
  previousHash: string | null;
  resourceId: string | null;
  resourceType: string;
  workspaceId: string;
  workspaceOwnerUserId: string;
};

type AuditRow = {
  action: WorkspaceAuditAction;
  actor_user_id: string;
  created_at: Date;
  details: Record<string, unknown>;
  event_hash: string;
  id: string;
  previous_hash: string | null;
  resource_id: string | null;
  resource_type: string;
  workspace_id: string;
  workspace_owner_user_id: string;
};

export type AuditAppendInput = {
  action: WorkspaceAuditAction;
  actorUserId: string;
  details?: Record<string, unknown>;
  resourceId?: string | null;
  resourceType: string;
  workspaceId: string;
  workspaceOwnerUserId: string;
};

@Injectable()
export class WorkspaceAuditService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async append(input: AuditAppendInput, client?: PoolClient): Promise<WorkspaceAuditEvent> {
    const query = client?.query.bind(client) ?? this.database.query.bind(this.database);

    // Look up the most recent hash for this workspace so we can chain.
    const previous = await query<{ event_hash: string }>(
      `
        SELECT event_hash
        FROM workspace_audit_events
        WHERE workspace_owner_user_id = $1 AND workspace_id = $2
        ORDER BY created_at DESC, id DESC
        LIMIT 1
      `,
      [input.workspaceOwnerUserId, input.workspaceId]
    );

    const previousHash = previous.rows[0]?.event_hash ?? null;
    const id = randomUUID();
    const details = input.details ?? {};
    const eventHash = computeHash({
      action: input.action,
      actorUserId: input.actorUserId,
      details,
      id,
      previousHash,
      resourceId: input.resourceId ?? null,
      resourceType: input.resourceType,
      workspaceId: input.workspaceId,
      workspaceOwnerUserId: input.workspaceOwnerUserId
    });

    const result = await query<AuditRow>(
      `
        INSERT INTO workspace_audit_events (
          id,
          workspace_id,
          workspace_owner_user_id,
          actor_user_id,
          action,
          resource_type,
          resource_id,
          details,
          previous_hash,
          event_hash
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10)
        RETURNING
          action,
          actor_user_id,
          created_at,
          details,
          event_hash,
          id,
          previous_hash,
          resource_id,
          resource_type,
          workspace_id,
          workspace_owner_user_id
      `,
      [
        id,
        input.workspaceId,
        input.workspaceOwnerUserId,
        input.actorUserId,
        input.action,
        input.resourceType,
        input.resourceId ?? null,
        JSON.stringify(details),
        previousHash,
        eventHash
      ]
    );

    return mapAuditRow(result.rows[0]);
  }

  async list(input: {
    cursor?: string | null;
    limit?: number;
    workspaceId: string;
    workspaceOwnerUserId: string;
  }): Promise<{ events: WorkspaceAuditEvent[]; nextCursor: string | null }> {
    const limit = Math.min(Math.max(input.limit ?? 50, 1), 200);

    const result = await this.database.query<AuditRow>(
      `
        SELECT
          action,
          actor_user_id,
          created_at,
          details,
          event_hash,
          id,
          previous_hash,
          resource_id,
          resource_type,
          workspace_id,
          workspace_owner_user_id
        FROM workspace_audit_events
        WHERE workspace_owner_user_id = $1
          AND workspace_id = $2
          ${input.cursor ? "AND (created_at, id) < ((SELECT created_at FROM workspace_audit_events WHERE id = $4), $4)" : ""}
        ORDER BY created_at DESC, id DESC
        LIMIT $3
      `,
      input.cursor
        ? [
            input.workspaceOwnerUserId,
            input.workspaceId,
            limit + 1,
            input.cursor
          ]
        : [input.workspaceOwnerUserId, input.workspaceId, limit + 1]
    );

    const events = result.rows.slice(0, limit).map(mapAuditRow);
    const nextCursor =
      result.rows.length > limit ? result.rows[limit - 1]?.id ?? null : null;

    return { events, nextCursor };
  }

  /**
   * Replays the chain front-to-back to confirm every recorded `event_hash`
   * matches the canonical hash of its content + previous hash. Returns the
   * id of the first tampered event, or null when the chain is intact.
   */
  async verifyChain(
    workspaceOwnerUserId: string,
    workspaceId: string
  ): Promise<{ tamperedAtId: string | null; verified: number }> {
    const result = await this.database.query<AuditRow>(
      `
        SELECT
          action,
          actor_user_id,
          created_at,
          details,
          event_hash,
          id,
          previous_hash,
          resource_id,
          resource_type,
          workspace_id,
          workspace_owner_user_id
        FROM workspace_audit_events
        WHERE workspace_owner_user_id = $1 AND workspace_id = $2
        ORDER BY created_at ASC, id ASC
      `,
      [workspaceOwnerUserId, workspaceId]
    );

    let previousHash: string | null = null;
    let verified = 0;
    for (const row of result.rows) {
      const expected = computeHash({
        action: row.action,
        actorUserId: row.actor_user_id,
        details: row.details ?? {},
        id: row.id,
        previousHash,
        resourceId: row.resource_id,
        resourceType: row.resource_type,
        workspaceId: row.workspace_id,
        workspaceOwnerUserId: row.workspace_owner_user_id
      });
      if (expected !== row.event_hash || row.previous_hash !== previousHash) {
        return { tamperedAtId: row.id, verified };
      }
      previousHash = row.event_hash;
      verified += 1;
    }

    return { tamperedAtId: null, verified };
  }
}

function computeHash(input: {
  action: string;
  actorUserId: string;
  details: Record<string, unknown>;
  id: string;
  previousHash: string | null;
  resourceId: string | null;
  resourceType: string;
  workspaceId: string;
  workspaceOwnerUserId: string;
}): string {
  const canonical = JSON.stringify({
    action: input.action,
    actorUserId: input.actorUserId,
    details: input.details,
    id: input.id,
    previousHash: input.previousHash,
    resourceId: input.resourceId,
    resourceType: input.resourceType,
    workspaceId: input.workspaceId,
    workspaceOwnerUserId: input.workspaceOwnerUserId
  });

  return createHash("sha256").update(canonical).digest("hex");
}

function mapAuditRow(row: AuditRow | undefined): WorkspaceAuditEvent {
  if (!row) {
    throw new Error("Workspace audit row not found.");
  }

  return {
    action: row.action,
    actorUserId: row.actor_user_id,
    createdAt: row.created_at,
    details: row.details ?? {},
    eventHash: row.event_hash,
    id: row.id,
    previousHash: row.previous_hash,
    resourceId: row.resource_id,
    resourceType: row.resource_type,
    workspaceId: row.workspace_id,
    workspaceOwnerUserId: row.workspace_owner_user_id
  };
}
