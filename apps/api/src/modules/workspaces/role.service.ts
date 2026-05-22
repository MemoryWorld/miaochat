import { randomUUID } from "node:crypto";

import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException
} from "@nestjs/common";

import {
  permissionsForRole,
  roleHasPermission,
  type WorkspacePermission,
  type WorkspaceRole
} from "@agenthub/domain";

import { DatabaseService } from "../database/database.service.js";
import { WorkspaceAuditService } from "./audit.service.js";

export type WorkspaceRoleSummary = {
  permissions: WorkspacePermission[];
  role: WorkspaceRole;
  userId: string;
  workspaceId: string;
  workspaceOwnerUserId: string;
};

export type WorkspaceRoleAuditEntry = {
  actorUserId: string;
  createdAt: Date;
  id: string;
  nextRole: WorkspaceRole;
  previousRole: WorkspaceRole | null;
  reason: string | null;
  targetUserId: string;
  workspaceId: string;
  workspaceOwnerUserId: string;
};

const VALID_ROLES = new Set<WorkspaceRole>(["owner", "admin", "member"]);

function asRole(candidate: string): WorkspaceRole {
  if (!VALID_ROLES.has(candidate as WorkspaceRole)) {
    throw new Error(`Unknown workspace role: ${candidate}`);
  }
  return candidate as WorkspaceRole;
}

@Injectable()
export class WorkspaceRoleService {
  constructor(
    @Inject(WorkspaceAuditService) private readonly audit: WorkspaceAuditService,
    @Inject(DatabaseService) private readonly database: DatabaseService
  ) {}

  /**
   * Resolves the role of `userId` inside the workspace identified by
   * (`workspaceOwnerUserId`, `workspaceId`). Returns null when the user is
   * not a member.
   */
  async getRole(
    workspaceOwnerUserId: string,
    workspaceId: string,
    userId: string
  ): Promise<WorkspaceRole | null> {
    const result = await this.database.query<{ role: string }>(
      `
        SELECT role
        FROM workspace_members
        WHERE workspace_owner_user_id = $1
          AND workspace_id = $2
          AND user_id = $3
        LIMIT 1
      `,
      [workspaceOwnerUserId, workspaceId, userId]
    );

    const role = result.rows[0]?.role;
    return role ? asRole(role) : null;
  }

  async describe(
    workspaceOwnerUserId: string,
    workspaceId: string,
    userId: string
  ): Promise<WorkspaceRoleSummary | null> {
    const role = await this.getRole(workspaceOwnerUserId, workspaceId, userId);
    if (!role) {
      return null;
    }

    return {
      permissions: [...permissionsForRole(role)],
      role,
      userId,
      workspaceId,
      workspaceOwnerUserId
    };
  }

  /**
   * Throws ForbiddenException when the user is not a member of the workspace
   * or the user's role lacks `permission`.
   */
  async assertPermission(
    workspaceOwnerUserId: string,
    workspaceId: string,
    userId: string,
    permission: WorkspacePermission
  ): Promise<WorkspaceRole> {
    const role = await this.getRole(workspaceOwnerUserId, workspaceId, userId);
    if (!role) {
      throw new ForbiddenException(
        `User ${userId} is not a member of workspace ${workspaceId}.`
      );
    }
    if (!roleHasPermission(role, permission)) {
      throw new ForbiddenException(
        `Role ${role} does not have permission ${permission}.`
      );
    }
    return role;
  }

  async updateMemberRole(input: {
    actorUserId: string;
    nextRole: WorkspaceRole;
    reason?: string | null;
    targetUserId: string;
    workspaceId: string;
    workspaceOwnerUserId: string;
  }): Promise<WorkspaceRoleSummary> {
    if (!VALID_ROLES.has(input.nextRole)) {
      throw new Error(`Unknown workspace role: ${input.nextRole}`);
    }

    if (input.actorUserId !== input.workspaceOwnerUserId) {
      throw new ForbiddenException(
        "Only the workspace owner may change member roles."
      );
    }

    if (input.targetUserId === input.workspaceOwnerUserId && input.nextRole !== "owner") {
      throw new ForbiddenException(
        "The workspace owner cannot demote themselves."
      );
    }

    return this.database
      .withClient(async (client) => {
        await client.query("BEGIN");

        try {
          const lookup = await client.query<{ role: string }>(
            `
              SELECT role
              FROM workspace_members
              WHERE workspace_owner_user_id = $1
                AND workspace_id = $2
                AND user_id = $3
              FOR UPDATE
            `,
            [input.workspaceOwnerUserId, input.workspaceId, input.targetUserId]
          );

          const previousRoleRaw = lookup.rows[0]?.role ?? null;
          if (!previousRoleRaw) {
            throw new NotFoundException(
              `User ${input.targetUserId} is not a member of workspace ${input.workspaceId}.`
            );
          }

          const previousRole = asRole(previousRoleRaw);

          await client.query(
            `
              UPDATE workspace_members
              SET role = $4,
                  updated_at = now()
              WHERE workspace_owner_user_id = $1
                AND workspace_id = $2
                AND user_id = $3
            `,
            [
              input.workspaceOwnerUserId,
              input.workspaceId,
              input.targetUserId,
              input.nextRole
            ]
          );

          await client.query(
            `
              INSERT INTO workspace_role_audit_events (
                id,
                workspace_id,
                workspace_owner_user_id,
                actor_user_id,
                target_user_id,
                previous_role,
                next_role,
                reason
              )
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            `,
            [
              randomUUID(),
              input.workspaceId,
              input.workspaceOwnerUserId,
              input.actorUserId,
              input.targetUserId,
              previousRole,
              input.nextRole,
              input.reason ?? null
            ]
          );

          await client.query("COMMIT");
          return { previousRole };
        } catch (error) {
          await client.query("ROLLBACK");
          throw error;
        }
      })
      .then(async ({ previousRole }) => {
        await this.audit.append({
          action: "role.change",
          actorUserId: input.actorUserId,
          details: {
            nextRole: input.nextRole,
            previousRole,
            reason: input.reason ?? null
          },
          resourceId: input.targetUserId,
          resourceType: "workspace_member",
          workspaceId: input.workspaceId,
          workspaceOwnerUserId: input.workspaceOwnerUserId
        });

        return {
          permissions: [...permissionsForRole(input.nextRole)],
          role: input.nextRole,
          userId: input.targetUserId,
          workspaceId: input.workspaceId,
          workspaceOwnerUserId: input.workspaceOwnerUserId
        };
      });
  }

  async listAuditEvents(
    workspaceOwnerUserId: string,
    workspaceId: string,
    limit = 100
  ): Promise<WorkspaceRoleAuditEntry[]> {
    const result = await this.database.query<{
      actor_user_id: string;
      created_at: Date;
      id: string;
      next_role: string;
      previous_role: string | null;
      reason: string | null;
      target_user_id: string;
      workspace_id: string;
      workspace_owner_user_id: string;
    }>(
      `
        SELECT
          actor_user_id,
          created_at,
          id,
          next_role,
          previous_role,
          reason,
          target_user_id,
          workspace_id,
          workspace_owner_user_id
        FROM workspace_role_audit_events
        WHERE workspace_owner_user_id = $1 AND workspace_id = $2
        ORDER BY created_at DESC
        LIMIT $3
      `,
      [workspaceOwnerUserId, workspaceId, Math.max(1, Math.min(limit, 500))]
    );

    return result.rows.map((row) => ({
      actorUserId: row.actor_user_id,
      createdAt: row.created_at,
      id: row.id,
      nextRole: asRole(row.next_role),
      previousRole: row.previous_role ? asRole(row.previous_role) : null,
      reason: row.reason,
      targetUserId: row.target_user_id,
      workspaceId: row.workspace_id,
      workspaceOwnerUserId: row.workspace_owner_user_id
    }));
  }
}
