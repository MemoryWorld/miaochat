import { randomUUID } from "node:crypto";

import { Inject, Injectable, NotFoundException } from "@nestjs/common";

import {
  createMessageInputSchema,
  messageIdSchema,
  messageSchema,
  workspaceIdSchema,
  type Message
} from "@agenthub/contracts";
import { z } from "zod";

import { ConversationsRepository } from "../conversations/conversations.repository.js";
import { GroupMembersService } from "../conversations/group-members.service.js";
import { DatabaseService } from "../database/database.service.js";
import { MessagesRepository, type MessageRow } from "./messages.repository.js";

type CreateStoredMessageInput = {
  content: string;
  conversationId: string;
  id: string;
  mentionedAgentIds: string[];
  ownerUserId: string;
  role: Message["role"];
  sourceAgentId: string | null;
  workspaceId: string;
};

const messageHistoryQuerySchema = z.object({
  conversationId: z.string().min(1),
  ownerUserId: z.string().min(1),
  workspaceId: workspaceIdSchema.default("default-workspace")
});

export type PinMessageResponse = {
  message: Message;
  pinnedMessageIds: string[];
};

@Injectable()
export class MessagesService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(ConversationsRepository)
    private readonly conversationsRepository: ConversationsRepository,
    @Inject(GroupMembersService) private readonly groupMembersService: GroupMembersService,
    @Inject(MessagesRepository) private readonly messagesRepository: MessagesRepository
  ) {}

  async create(input: unknown, ownerUserId: string): Promise<Message> {
    const parsed = createMessageInputSchema.parse(input);
    await this.assertConversationOwnership(parsed.conversationId, parsed.workspaceId, ownerUserId);
    const mentionedAgentIds = await this.groupMembersService.resolveMentionedAgentIds({
      conversationId: parsed.conversationId,
      mentionedAgentIds: parsed.mentionedAgentIds,
      ownerUserId,
      workspaceId: parsed.workspaceId
    });

    return this.createStored({
      content: parsed.content,
      conversationId: parsed.conversationId,
      id: randomUUID(),
      mentionedAgentIds,
      ownerUserId,
      role: parsed.role,
      sourceAgentId: null,
      workspaceId: parsed.workspaceId
    });
  }

  async createAssistantMessage(input: {
    content: string;
    conversationId: string;
    id: string;
    ownerUserId: string;
    sourceAgentId: string | null;
    workspaceId: string;
  }): Promise<Message> {
    return this.createStored({
      content: input.content,
      conversationId: input.conversationId,
      id: input.id,
      mentionedAgentIds: [],
      ownerUserId: input.ownerUserId,
      role: "assistant",
      sourceAgentId: input.sourceAgentId,
      workspaceId: input.workspaceId
    });
  }

  async createStored(input: CreateStoredMessageInput): Promise<Message> {
    const parsed = messageSchema
      .omit({
        createdAt: true,
        isPinned: true
      })
      .extend({
        content: z.string().trim().min(1),
        isPinned: z.boolean().default(false)
      })
      .parse({
        content: input.content,
        conversationId: input.conversationId,
        id: input.id,
        mentionedAgentIds: input.mentionedAgentIds,
        ownerUserId: input.ownerUserId,
        role: input.role,
        sourceAgentId: input.sourceAgentId,
        workspaceId: input.workspaceId
      });

    return this.database.transaction(async (tx) => {
      const inserted = await this.messagesRepository.createMessage(
        {
          content: parsed.content,
          conversationId: parsed.conversationId,
          id: parsed.id,
          isPinned: false,
          mentionedAgentIds: parsed.mentionedAgentIds,
          ownerUserId: parsed.ownerUserId,
          role: parsed.role,
          sourceAgentId: parsed.sourceAgentId,
          workspaceId: parsed.workspaceId
        },
        tx
      );

      await this.touchConversation(
        parsed.conversationId,
        parsed.workspaceId,
        parsed.ownerUserId,
        tx
      );
      return mapMessageRow(inserted);
    });
  }

  async list(input: unknown): Promise<Message[]> {
    const parsed = messageHistoryQuerySchema.parse(input);
    const result = await this.messagesRepository.listMessages(
      parsed.conversationId,
      parsed.workspaceId,
      parsed.ownerUserId
    );

    if (result.length === 0) {
      await this.assertConversationOwnership(
        parsed.conversationId,
        parsed.workspaceId,
        parsed.ownerUserId
      );
    }

    return result.map(mapMessageRow);
  }

  async pin(
    messageId: string,
    workspaceId: string,
    ownerUserId: string
  ): Promise<PinMessageResponse> {
    const parsedMessageId = messageIdSchema.parse(messageId);
    const parsedWorkspaceId = workspaceIdSchema.parse(workspaceId);

    return this.database.transaction(async (tx) => {
      const messageRow = await this.messagesRepository.pinMessage(
        parsedMessageId,
        parsedWorkspaceId,
        ownerUserId,
        tx
      );

      if (!messageRow) {
        throw new NotFoundException(
          `Message ${parsedMessageId} was not found in workspace ${parsedWorkspaceId}`
        );
      }

      const message = mapMessageRow(messageRow);
      const pinnedMessageIds = await this.messagesRepository.appendPinnedMessageId(
        message.conversationId,
        message.id,
        parsedWorkspaceId,
        ownerUserId,
        tx
      );

      return {
        message,
        pinnedMessageIds
      };
    });
  }

  private async touchConversation(
    conversationId: string,
    workspaceId: string,
    ownerUserId: string,
    executor?: import("../database/database.service.js").DatabaseExecutor
  ): Promise<void> {
    const updatedCount = await this.messagesRepository.touchConversation(
      conversationId,
      workspaceId,
      ownerUserId,
      executor
    );

    if (updatedCount === 0) {
      throw new NotFoundException(
        `Conversation ${conversationId} was not found in workspace ${workspaceId}`
      );
    }
  }

  private async assertConversationOwnership(
    conversationId: string,
    workspaceId: string,
    ownerUserId: string
  ): Promise<void> {
    const exists = await this.conversationsRepository.conversationExists(
      conversationId,
      workspaceId,
      ownerUserId
    );

    if (!exists) {
      throw new NotFoundException(
        `Conversation ${conversationId} was not found in workspace ${workspaceId}`
      );
    }
  }
}

function mapMessageRow(row: MessageRow | undefined): Message {
  if (!row) {
    throw new Error("Message row not found");
  }

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
