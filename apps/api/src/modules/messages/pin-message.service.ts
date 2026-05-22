import { Inject, Injectable } from "@nestjs/common";

import { messageSchema, type Message } from "@agenthub/contracts";
import { assemblePinnedContext, type ConversationContext } from "@agenthub/domain";

import { MessagesRepository, type MessageRow } from "./messages.repository.js";

@Injectable()
export class PinMessageService {
  constructor(
    @Inject(MessagesRepository) private readonly messagesRepository: MessagesRepository
  ) {}

  async loadConversationContext(
    conversationId: string,
    workspaceId: string,
    ownerUserId: string
  ): Promise<ConversationContext> {
    const result = await this.messagesRepository.listPinnedMessages(
      conversationId,
      workspaceId,
      ownerUserId
    );

    return assemblePinnedContext(result.map(mapPinnedMessageRow));
  }
}

function mapPinnedMessageRow(row: MessageRow): Message {
  return messageSchema.parse({
    content: row.content,
    conversationId: row.conversation_id,
    createdAt: row.created_at,
    id: row.id,
    isPinned: row.is_pinned,
    mentionedAgentIds: row.mentioned_agent_ids ?? [],
    ownerUserId: row.owner_user_id,
    role: row.role,
    sourceAgentId: row.source_agent_id,
    workspaceId: row.workspace_id
  });
}
