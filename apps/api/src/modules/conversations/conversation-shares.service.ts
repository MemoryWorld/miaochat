import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException
} from "@nestjs/common";

import { z } from "zod";

import { WorkspaceAuditService } from "../workspaces/audit.service.js";
import { WorkspaceMembershipsService } from "../workspaces/memberships.service.js";
import {
  ConversationsRepository,
  type ConversationShareRow
} from "./conversations.repository.js";

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

@Injectable()
export class ConversationSharesService {
  constructor(
    @Inject(WorkspaceAuditService) private readonly audit: WorkspaceAuditService,
    @Inject(ConversationsRepository)
    private readonly conversationsRepository: ConversationsRepository,
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

      const result = await this.conversationsRepository.upsertShare(
        {
          actorUserId,
          conversationId,
          permission: parsed.permission,
          sharedWithUserId: userId,
          workspaceId: conversation.workspaceId,
          workspaceOwnerUserId: conversation.ownerUserId
        }
      );

      inserted.push(mapShareRow(result));
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

    const result = await this.conversationsRepository.listShares(conversationId);

    return result.map(mapShareRow);
  }

  async revoke(
    actorUserId: string,
    conversationId: string,
    sharedWithUserId: string
  ): Promise<void> {
    await this.findConversationOwnedBy(conversationId, actorUserId);

    const deletedCount = await this.conversationsRepository.revokeShare(
      conversationId,
      sharedWithUserId
    );

    if (deletedCount === 0) {
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
    const result = await this.conversationsRepository.listSharedWith(
      actorUserId,
      workspaceOwnerUserId,
      workspaceId
    );

    return result.map((row) => ({
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
    const result = await this.conversationsRepository.findOwnedConversation(
      conversationId,
      actorUserId
    );

    if (!result) {
      throw new NotFoundException(
        `Conversation ${conversationId} was not found for the authenticated user.`
      );
    }

    return {
      ownerUserId: result.owner_user_id,
      workspaceId: result.workspace_id
    };
  }
}

function mapShareRow(row: ConversationShareRow | undefined): ConversationShare {
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
