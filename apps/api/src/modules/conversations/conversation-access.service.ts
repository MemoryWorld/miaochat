import { Inject, Injectable, NotFoundException } from "@nestjs/common";

import {
  WorkspaceAuditService,
  type WorkspaceAuditEvent
} from "../workspaces/audit.service.js";
import { ConversationsRepository } from "./conversations.repository.js";

@Injectable()
export class ConversationAccessService {
  constructor(
    @Inject(WorkspaceAuditService) private readonly audit: WorkspaceAuditService,
    @Inject(ConversationsRepository)
    private readonly conversationsRepository: ConversationsRepository
  ) {}

  /**
   * Returns the audit timeline scoped to a single conversation. Filters the
   * workspace audit log to only events that reference this conversation
   * (either as the resource or via the `details.conversationId` payload).
   */
  async listForConversation(
    actorUserId: string,
    conversationId: string
  ): Promise<WorkspaceAuditEvent[]> {
    const conversation = await this.conversationsRepository.findOwnedConversation(
      conversationId,
      actorUserId
    );

    if (!conversation) {
      throw new NotFoundException(
        `Conversation ${conversationId} was not found for the authenticated user.`
      );
    }

    const { events } = await this.audit.list({
      limit: 200,
      workspaceId: conversation.workspace_id,
      workspaceOwnerUserId: conversation.owner_user_id
    });

    return events.filter((event) => {
      if (event.resourceId === conversationId) {
        return true;
      }
      const detail = event.details as { conversationId?: unknown };
      return detail?.conversationId === conversationId;
    });
  }
}
