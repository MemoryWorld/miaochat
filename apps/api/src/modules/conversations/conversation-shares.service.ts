import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException
} from "@nestjs/common";

import { z } from "zod";

import { DatabaseService } from "../database/database.service.js";
import { WorkspaceAuditService } from "../workspaces/audit.service.js";
import { WorkspaceMembershipsService } from "../workspaces/memberships.service.js";

export type ConversationSharePermission = "read" | "comment";

export type ConversationShare = {
  conversationId: string;
  createdAt: Date;
  createdByUserId: string;
  permission: ConversationSharePermission;
  sharedWithUserId: string;
  workspaceId: string;
  workspaceOwnerUserId: string;
};

const shareInputSchema = z.object({
  permission: z.enum(["read", "comment"]).default("read"),
  userIds: z.array(z.string().min(1)).min(1).max(50)
});

type ShareRow = {
  conversation_id: string;
  created_at: Date;
  created_by_user_id: string;
  permission: ConversationSharePermission;
  shared_with_user_id: string;
  workspace_id: string;
  workspace_owner_user_id: string;
};

@Injectable()
export class ConversationSharesService {
  constructor(
    @Inject(WorkspaceAuditService) private readonly audit: WorkspaceAuditService,
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(WorkspaceMembershipsService)
    private readonly memberships: WorkspaceMembershipsService
  ) {}

  async share(
    actorUserId: string,
    conversationId: string,
    rawInput: unknown
  ): Promise<ConversationShare[]> {
    const parsed = shareInputSchema.parse(rawInput);

    const conversation = await this.findConversationOwnedBy(
      conversationId,
      actorUserId
    );

    // Each invitee must already be a member of the same workspace.
    const inserted: ConversationShare[] = [];
    for (const userId of parsed.userIds) {
      const isMember = await this.memberships.isMember(
        conversation.ownerUserId,
        conversation.workspaceId,
        userId
      );
      if (!isMember) {
        throw new BadRequestException(
          `User ${userId} is not a member of workspace ${conversation.workspaceId}.`
        );
      }

      const result = await this.database.query<ShareRow>(
        `
          INSERT INTO conversation_shares (
            conversation_id,
            workspace_id,
            workspace_owner_user_id,
            shared_with_user_id,
            permission,
            created_by_user_id
          )
          VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT (conversation_id, shared_with_user_id) DO UPDATE
            SET permission = EXCLUDED.permission
          RETURNING
            conversation_id,
            created_at,
            created_by_user_id,
            permission,
            shared_with_user_id,
            workspace_id,
            workspace_owner_user_id
        `,
        [
          conversationId,
          conversation.workspaceId,
          conversation.ownerUserId,
          userId,
          parsed.permission,
          actorUserId
        ]
      );

      inserted.push(mapShareRow(result.rows[0]));
    }

    await this.audit.append({
      action: "conversation.share",
      actorUserId,
      details: {
        conversationId,
        permission: parsed.permission,
        sharedWith: parsed.userIds
      },
      resourceId: conversationId,
      resourceType: "conversation",
      workspaceId: conversation.workspaceId,
      workspaceOwnerUserId: conversation.ownerUserId
    });

    return inserted;
  }

  async list(
    actorUserId: string,
    conversationId: string
  ): Promise<ConversationShare[]> {
    await this.findConversationOwnedBy(conversationId, actorUserId);

    const result = await this.database.query<ShareRow>(
      `
        SELECT
          conversation_id,
          created_at,
          created_by_user_id,
          permission,
          shared_with_user_id,
          workspace_id,
          workspace_owner_user_id
        FROM conversation_shares
        WHERE conversation_id = $1
        ORDER BY created_at ASC
      `,
      [conversationId]
    );

    return result.rows.map(mapShareRow);
  }

  async revoke(
    actorUserId: string,
    conversationId: string,
    sharedWithUserId: string
  ): Promise<void> {
    await this.findConversationOwnedBy(conversationId, actorUserId);

    const result = await this.database.query(
      `
        DELETE FROM conversation_shares
        WHERE conversation_id = $1 AND shared_with_user_id = $2
      `,
      [conversationId, sharedWithUserId]
    );

    if ((result.rowCount ?? 0) === 0) {
      throw new NotFoundException(
        `Share for ${sharedWithUserId} on conversation ${conversationId} was not found.`
      );
    }
  }

  /**
   * Returns the conversations that have been shared with the calling user
   * within the given workspace namespace.
   */
  async listSharedWith(
    actorUserId: string,
    workspaceOwnerUserId: string,
    workspaceId: string
  ): Promise<{
    conversationId: string;
    permission: ConversationSharePermission;
    workspaceId: string;
    workspaceOwnerUserId: string;
  }[]> {
    const result = await this.database.query<{
      conversation_id: string;
      permission: ConversationSharePermission;
      workspace_id: string;
      workspace_owner_user_id: string;
    }>(
      `
        SELECT
          conversation_id,
          permission,
          workspace_id,
          workspace_owner_user_id
        FROM conversation_shares
        WHERE shared_with_user_id = $1
          AND workspace_owner_user_id = $2
          AND workspace_id = $3
        ORDER BY created_at DESC
      `,
      [actorUserId, workspaceOwnerUserId, workspaceId]
    );

    return result.rows.map((row) => ({
      conversationId: row.conversation_id,
      permission: row.permission,
      workspaceId: row.workspace_id,
      workspaceOwnerUserId: row.workspace_owner_user_id
    }));
  }

  private async findConversationOwnedBy(
    conversationId: string,
    actorUserId: string
  ): Promise<{ ownerUserId: string; workspaceId: string }> {
    const result = await this.database.query<{
      owner_user_id: string;
      workspace_id: string;
    }>(
      `
        SELECT owner_user_id, workspace_id
        FROM conversations
        WHERE id = $1 AND owner_user_id = $2
      `,
      [conversationId, actorUserId]
    );

    if (!result.rows[0]) {
      throw new NotFoundException(
        `Conversation ${conversationId} was not found for the authenticated user.`
      );
    }

    return {
      ownerUserId: result.rows[0].owner_user_id,
      workspaceId: result.rows[0].workspace_id
    };
  }
}

function mapShareRow(row: ShareRow | undefined): ConversationShare {
  if (!row) {
    throw new Error("Conversation share row not found.");
  }

  return {
    conversationId: row.conversation_id,
    createdAt: row.created_at,
    createdByUserId: row.created_by_user_id,
    permission: row.permission,
    sharedWithUserId: row.shared_with_user_id,
    workspaceId: row.workspace_id,
    workspaceOwnerUserId: row.workspace_owner_user_id
  };
}
