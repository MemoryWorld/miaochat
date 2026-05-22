import { Inject, Injectable, NotFoundException } from "@nestjs/common";

import { DatabaseService } from "../database/database.service.js";
import {
  WorkspaceAuditService,
  type WorkspaceAuditEvent
} from "../workspaces/audit.service.js";

@Injectable()
export class ConversationAccessService {
  constructor(
    @Inject(WorkspaceAuditService) private readonly audit: WorkspaceAuditService,
    @Inject(DatabaseService) private readonly database: DatabaseService
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
    const conversation = await this.database.query<{
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

    if (!conversation.rows[0]) {
      throw new NotFoundException(
        `Conversation ${conversationId} was not found for the authenticated user.`
      );
    }

    const { events } = await this.audit.list({
      limit: 200,
      workspaceId: conversation.rows[0].workspace_id,
      workspaceOwnerUserId: conversation.rows[0].owner_user_id
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
