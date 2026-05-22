import { Inject, Injectable } from "@nestjs/common";

import {
  workspaceMemberSchema,
  type WorkspaceMember,
  type WorkspaceRole
} from "@agenthub/contracts";
import type { PoolClient } from "pg";

import { DatabaseService } from "../database/database.service.js";

type MemberRow = {
  joined_at: Date;
  role: WorkspaceRole;
  user_id: string;
  workspace_id: string;
  workspace_owner_user_id: string;
};

@Injectable()
export class WorkspaceMembershipsService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async list(workspaceOwnerUserId: string, workspaceId: string): Promise<WorkspaceMember[]> {
    const result = await this.database.query<MemberRow>(
      `
        SELECT
          joined_at,
          role,
          user_id,
          workspace_id,
          workspace_owner_user_id
        FROM workspace_members
        WHERE workspace_owner_user_id = $1 AND workspace_id = $2
        ORDER BY joined_at ASC
      `,
      [workspaceOwnerUserId, workspaceId]
    );

    return result.rows.map(mapMemberRow);
  }

  async upsertOwner(
    workspaceOwnerUserId: string,
    workspaceId: string,
    client?: PoolClient
  ): Promise<void> {
    const query = client?.query.bind(client) ?? this.database.query.bind(this.database);

    await query(
      `
        INSERT INTO workspace_members (
          workspace_id,
          workspace_owner_user_id,
          user_id,
          role
        )
        VALUES ($1, $2, $2, 'owner')
        ON CONFLICT (workspace_owner_user_id, workspace_id, user_id) DO NOTHING
      `,
      [workspaceId, workspaceOwnerUserId]
    );
  }

  async addMember(
    workspaceOwnerUserId: string,
    workspaceId: string,
    userId: string,
    role: WorkspaceRole = "member",
    client?: PoolClient
  ): Promise<WorkspaceMember> {
    const query = client?.query.bind(client) ?? this.database.query.bind(this.database);

    const result = await query<MemberRow>(
      `
        INSERT INTO workspace_members (
          workspace_id,
          workspace_owner_user_id,
          user_id,
          role
        )
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (workspace_owner_user_id, workspace_id, user_id) DO UPDATE
          SET role = EXCLUDED.role,
              updated_at = now()
        RETURNING
          joined_at,
          role,
          user_id,
          workspace_id,
          workspace_owner_user_id
      `,
      [workspaceId, workspaceOwnerUserId, userId, role]
    );

    const row = result.rows[0];
    if (!row) {
      throw new Error("Failed to insert workspace member.");
    }

    return mapMemberRow(row);
  }

  async isMember(
    workspaceOwnerUserId: string,
    workspaceId: string,
    userId: string
  ): Promise<boolean> {
    const result = await this.database.query<{ user_id: string }>(
      `
        SELECT user_id
        FROM workspace_members
        WHERE workspace_owner_user_id = $1
          AND workspace_id = $2
          AND user_id = $3
        LIMIT 1
      `,
      [workspaceOwnerUserId, workspaceId, userId]
    );

    return Boolean(result.rows[0]);
  }
}

function mapMemberRow(row: MemberRow | undefined): WorkspaceMember {
  if (!row) {
    throw new Error("Workspace member row not found.");
  }

  return workspaceMemberSchema.parse({
    joinedAt: row.joined_at,
    role: row.role,
    userId: row.user_id,
    workspaceId: row.workspace_id,
    workspaceOwnerUserId: row.workspace_owner_user_id
  });
}
