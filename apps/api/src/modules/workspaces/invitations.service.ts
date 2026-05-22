import { createHash, randomBytes, randomUUID } from "node:crypto";

import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException
} from "@nestjs/common";

import {
  createWorkspaceInvitationInputSchema,
  workspaceInvitationSchema,
  type WorkspaceInvitation,
  type WorkspaceRole
} from "@agenthub/contracts";

import { DatabaseService } from "../database/database.service.js";
import { WorkspaceAuditService } from "./audit.service.js";
import { WorkspaceMembershipsService } from "./memberships.service.js";

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type InvitationRow = {
  accepted_at: Date | null;
  accepted_user_id: string | null;
  created_at: Date;
  expires_at: Date;
  id: string;
  invited_by_user_id: string;
  invited_email: string;
  role: WorkspaceRole;
  status: "accepted" | "expired" | "pending" | "revoked";
  workspace_id: string;
  workspace_owner_user_id: string;
};

export type IssuedInvitation = {
  invitation: WorkspaceInvitation;
  token: string;
};

@Injectable()
export class WorkspaceInvitationsService {
  constructor(
    @Inject(WorkspaceAuditService) private readonly audit: WorkspaceAuditService,
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(WorkspaceMembershipsService)
    private readonly memberships: WorkspaceMembershipsService
  ) {}

  async invite(
    workspaceOwnerUserId: string,
    workspaceId: string,
    rawInput: unknown
  ): Promise<IssuedInvitation> {
    const parsed = createWorkspaceInvitationInputSchema.parse(rawInput);
    const normalizedEmail = parsed.invitedEmail.trim().toLowerCase();

    await this.assertWorkspaceOwnership(workspaceOwnerUserId, workspaceId);

    const existingMember = await this.database.query<{ id: string }>(
      `
        SELECT users.id
        FROM users
        INNER JOIN workspace_members
          ON workspace_members.user_id = users.id
          AND workspace_members.workspace_owner_user_id = $1
          AND workspace_members.workspace_id = $2
        WHERE lower(users.email) = $3
        LIMIT 1
      `,
      [workspaceOwnerUserId, workspaceId, normalizedEmail]
    );
    if (existingMember.rows[0]) {
      throw new ConflictException(
        `User ${normalizedEmail} is already a member of workspace ${workspaceId}.`
      );
    }

    const existingPending = await this.database.query<{ id: string }>(
      `
        SELECT id
        FROM workspace_invitations
        WHERE workspace_owner_user_id = $1
          AND workspace_id = $2
          AND lower(invited_email) = $3
          AND status = 'pending'
        LIMIT 1
      `,
      [workspaceOwnerUserId, workspaceId, normalizedEmail]
    );
    if (existingPending.rows[0]) {
      throw new ConflictException(
        `An invitation for ${normalizedEmail} is already pending.`
      );
    }

    const rawToken = randomBytes(32).toString("base64url");
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + INVITATION_TTL_MS);

    const result = await this.database.query<InvitationRow>(
      `
        INSERT INTO workspace_invitations (
          id,
          workspace_id,
          workspace_owner_user_id,
          invited_email,
          invited_by_user_id,
          role,
          token_hash,
          status,
          expires_at
        )
        VALUES ($1, $2, $3, $4, $3, $5, $6, 'pending', $7)
        RETURNING
          accepted_at,
          accepted_user_id,
          created_at,
          expires_at,
          id,
          invited_by_user_id,
          invited_email,
          role,
          status,
          workspace_id,
          workspace_owner_user_id
      `,
      [
        randomUUID(),
        workspaceId,
        workspaceOwnerUserId,
        normalizedEmail,
        parsed.role,
        tokenHash,
        expiresAt
      ]
    );

    const invitation = mapInvitationRow(result.rows[0]);
    await this.audit.append({
      action: "member.invite",
      actorUserId: workspaceOwnerUserId,
      details: {
        invitationId: invitation.id,
        invitedEmail: invitation.invitedEmail,
        role: invitation.role
      },
      resourceId: invitation.id,
      resourceType: "workspace_invitation",
      workspaceId,
      workspaceOwnerUserId
    });

    return {
      invitation,
      token: rawToken
    };
  }

  async listForWorkspace(
    workspaceOwnerUserId: string,
    workspaceId: string
  ): Promise<WorkspaceInvitation[]> {
    await this.assertWorkspaceOwnership(workspaceOwnerUserId, workspaceId);

    const result = await this.database.query<InvitationRow>(
      `
        SELECT
          accepted_at,
          accepted_user_id,
          created_at,
          expires_at,
          id,
          invited_by_user_id,
          invited_email,
          role,
          status,
          workspace_id,
          workspace_owner_user_id
        FROM workspace_invitations
        WHERE workspace_owner_user_id = $1 AND workspace_id = $2
        ORDER BY created_at DESC
      `,
      [workspaceOwnerUserId, workspaceId]
    );

    return result.rows.map(mapInvitationRow);
  }

  async accept(
    token: string,
    acceptingUserId: string,
    acceptingUserEmail: string
  ): Promise<WorkspaceInvitation> {
    if (!token || token.trim() === "") {
      throw new BadRequestException("An invitation token is required.");
    }

    const tokenHash = hashToken(token);

    const accepted = await this.database.withClient(async (client) => {
      await client.query("BEGIN");

      try {
        const lookup = await client.query<InvitationRow>(
          `
            SELECT
              accepted_at,
              accepted_user_id,
              created_at,
              expires_at,
              id,
              invited_by_user_id,
              invited_email,
              role,
              status,
              workspace_id,
              workspace_owner_user_id
            FROM workspace_invitations
            WHERE token_hash = $1
            FOR UPDATE
          `,
          [tokenHash]
        );

        const row = lookup.rows[0];
        if (!row) {
          throw new NotFoundException("Invitation token is invalid.");
        }

        if (row.status !== "pending") {
          throw new BadRequestException(`Invitation is ${row.status}.`);
        }

        if (row.expires_at.getTime() <= Date.now()) {
          await client.query(
            `UPDATE workspace_invitations SET status = 'expired', updated_at = now() WHERE id = $1`,
            [row.id]
          );
          throw new BadRequestException("Invitation has expired.");
        }

        if (row.invited_email.toLowerCase() !== acceptingUserEmail.toLowerCase()) {
          throw new BadRequestException(
            "Invitation was issued to a different email address."
          );
        }

        await this.memberships.addMember(
          row.workspace_owner_user_id,
          row.workspace_id,
          acceptingUserId,
          row.role,
          client
        );

        const updated = await client.query<InvitationRow>(
          `
            UPDATE workspace_invitations
            SET status = 'accepted',
                accepted_at = now(),
                accepted_user_id = $2,
                updated_at = now()
            WHERE id = $1
            RETURNING
              accepted_at,
              accepted_user_id,
              created_at,
              expires_at,
              id,
              invited_by_user_id,
              invited_email,
              role,
              status,
              workspace_id,
              workspace_owner_user_id
          `,
          [row.id, acceptingUserId]
        );

        await client.query("COMMIT");
        return mapInvitationRow(updated.rows[0]);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    });

    // Audit append runs after the connection is released to avoid deadlocking
    // the test pool (which is sized to a single connection).
    await this.audit.append({
      action: "member.invitation.accepted",
      actorUserId: acceptingUserId,
      details: {
        invitationId: accepted.id,
        invitedEmail: accepted.invitedEmail,
        role: accepted.role
      },
      resourceId: accepted.id,
      resourceType: "workspace_invitation",
      workspaceId: accepted.workspaceId,
      workspaceOwnerUserId: accepted.workspaceOwnerUserId
    });

    return accepted;
  }

  async revoke(
    workspaceOwnerUserId: string,
    workspaceId: string,
    invitationId: string
  ): Promise<WorkspaceInvitation> {
    await this.assertWorkspaceOwnership(workspaceOwnerUserId, workspaceId);

    const result = await this.database.query<InvitationRow>(
      `
        UPDATE workspace_invitations
        SET status = 'revoked',
            revoked_at = now(),
            updated_at = now()
        WHERE id = $1
          AND workspace_owner_user_id = $2
          AND workspace_id = $3
          AND status = 'pending'
        RETURNING
          accepted_at,
          accepted_user_id,
          created_at,
          expires_at,
          id,
          invited_by_user_id,
          invited_email,
          role,
          status,
          workspace_id,
          workspace_owner_user_id
      `,
      [invitationId, workspaceOwnerUserId, workspaceId]
    );

    const row = result.rows[0];
    if (!row) {
      throw new NotFoundException(
        `Pending invitation ${invitationId} was not found in workspace ${workspaceId}.`
      );
    }

    return mapInvitationRow(row);
  }

  private async assertWorkspaceOwnership(
    workspaceOwnerUserId: string,
    workspaceId: string
  ): Promise<void> {
    const result = await this.database.query<{ id: string }>(
      `SELECT id FROM workspaces WHERE owner_user_id = $1 AND id = $2`,
      [workspaceOwnerUserId, workspaceId]
    );

    if (!result.rows[0]) {
      throw new NotFoundException(
        `Workspace ${workspaceId} not found for the authenticated user.`
      );
    }
  }
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function mapInvitationRow(row: InvitationRow | undefined): WorkspaceInvitation {
  if (!row) {
    throw new Error("Workspace invitation row not found.");
  }

  return workspaceInvitationSchema.parse({
    acceptedAt: row.accepted_at,
    acceptedUserId: row.accepted_user_id,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    id: row.id,
    invitedByUserId: row.invited_by_user_id,
    invitedEmail: row.invited_email,
    role: row.role,
    status: row.status,
    workspaceId: row.workspace_id,
    workspaceOwnerUserId: row.workspace_owner_user_id
  });
}
