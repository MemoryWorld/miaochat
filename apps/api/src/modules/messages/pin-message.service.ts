import { Inject, Injectable } from "@nestjs/common";

import { messageSchema, type Message } from "@agenthub/contracts";
import { assembleConversationContext, type ConversationContext } from "@agenthub/domain";

import { MessagesRepository, type MessageRow } from "./messages.repository.js";

@Injectable()
export class PinMessageService {
  constructor(
    @Inject(MessagesRepository) private readonly messagesRepository: MessagesRepository
  ) {}

  async loadConversationContext(
    conversationId: string,
    workspaceId: string,
    ownerUserId: string,
    options: {
      excludeMessageId?: string;
      maxContextChars?: number;
      recentLimit?: number;
    } = {}
  ): Promise<ConversationContext> {
    const recentLimit = clampPositiveInteger(
      options.recentLimit ?? parseIntegerEnv("MIAOCHAT_AGENT_HISTORY_MESSAGE_LIMIT") ?? 12,
      24
    );
    const maxContextChars = clampPositiveInteger(
      options.maxContextChars ?? parseIntegerEnv("MIAOCHAT_AGENT_CONTEXT_CHAR_BUDGET") ?? 12_000,
      48_000
    );
    const [pinnedRows, recentRows] = await Promise.all([
      this.messagesRepository.listPinnedMessages(conversationId, workspaceId, ownerUserId),
      this.messagesRepository.listRecentContextMessages({
        conversationId,
        excludeMessageId: options.excludeMessageId,
        limit: recentLimit,
        ownerUserId,
        workspaceId
      })
    ]);

    return assembleConversationContext({
      maxChars: maxContextChars,
      pinnedMessages: pinnedRows.map(mapPinnedMessageRow),
      recentMessages: recentRows.map(mapPinnedMessageRow)
    });
  }
}

function parseIntegerEnv(name: string): number | null {
  const value = process.env[name];

  if (!value) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function clampPositiveInteger(value: number, max: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return max;
  }

  return Math.min(Math.floor(value), max);
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
