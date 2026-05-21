import { Inject, Injectable } from "@nestjs/common";

import { messageSchema, type Message } from "@agenthub/contracts";
import { assemblePinnedContext, type ConversationContext } from "@agenthub/domain";

import { DatabaseService } from "../database/database.service.js";

type PinnedMessageRow = {
  content: string;
  conversation_id: string;
  created_at: Date;
  id: string;
  is_pinned: boolean;
  role: Message["role"];
  source_agent_id: string | null;
  workspace_id: string;
};

@Injectable()
export class PinMessageService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async loadConversationContext(
    conversationId: string,
    workspaceId: string
  ): Promise<ConversationContext> {
    const result = await this.database.query<PinnedMessageRow>(
      `
        SELECT
          id,
          conversation_id,
          role,
          content,
          created_at,
          is_pinned,
          source_agent_id,
          workspace_id
        FROM messages
        WHERE conversation_id = $1 AND workspace_id = $2 AND is_pinned = true
        ORDER BY created_at ASC
      `,
      [conversationId, workspaceId]
    );

    return assemblePinnedContext(result.rows.map(mapPinnedMessageRow));
  }
}

function mapPinnedMessageRow(row: PinnedMessageRow): Message {
  return messageSchema.parse({
    content: row.content,
    conversationId: row.conversation_id,
    createdAt: row.created_at,
    id: row.id,
    isPinned: row.is_pinned,
    role: row.role,
    sourceAgentId: row.source_agent_id,
    workspaceId: row.workspace_id
  });
}
