import { randomUUID } from "node:crypto";

import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException
} from "@nestjs/common";

import {
  createMessageInputSchema,
  messageIdSchema,
  messageSchema,
  messageThreadSchema,
  sanitizeAssistantVisibleContent,
  toggleMessageReactionInputSchema,
  workspaceIdSchema,
  type Message,
  type MessageThread
} from "@agenthub/contracts";
import { z } from "zod";

import {
  ChannelMembersService,
  type ChannelAccess
} from "../channels/channel-members.service.js";
import { GroupMembersService } from "../conversations/group-members.service.js";
import {
  DatabaseService,
  type DatabaseExecutor
} from "../database/database.service.js";
import { MultiAgentHarnessService } from "../multi-agent-harness/multi-agent-harness.service.js";
import { MessagesRepository, type MessageRow } from "./messages.repository.js";

type CreateStoredMessageInput = {
  content: string;
  conversationId: string;
  id: string;
  mentionedAgentIds: string[];
  mentionedUserIds: string[];
  authorUserId: string | null;
  ownerUserId: string;
  role: Message["role"];
  sourceAgentId: string | null;
  threadParentMessageId: string | null;
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
    @Inject(ChannelMembersService)
    private readonly channelMembersService: ChannelMembersService,
    @Inject(GroupMembersService) private readonly groupMembersService: GroupMembersService,
    @Inject(MultiAgentHarnessService)
    private readonly multiAgentHarnessService: MultiAgentHarnessService,
    @Inject(MessagesRepository) private readonly messagesRepository: MessagesRepository
  ) {}

  async resolveSendAccess(input: {
    actorUserId: string;
    conversationId: string;
    workspaceId: string;
  }): Promise<ChannelAccess> {
    return this.channelMembersService.assertCanSend({
      actorUserId: input.actorUserId,
      channelId: input.conversationId,
      workspaceId: input.workspaceId
    });
  }

  async create(
    input: unknown,
    actorUserId: string,
    sendAccess?: ChannelAccess
  ): Promise<Message> {
    const parsed = createMessageInputSchema.parse(input);
    if (parsed.role !== "user") {
      throw new BadRequestException("只能由当前用户发送消息。");
    }

    const access =
      sendAccess ??
      (await this.resolveSendAccess({
        actorUserId,
        conversationId: parsed.conversationId,
        workspaceId: parsed.workspaceId
      }));
    await this.assertThreadParent({
      conversationId: parsed.conversationId,
      ownerUserId: access.ownerUserId,
      threadParentMessageId: parsed.threadParentMessageId,
      workspaceId: parsed.workspaceId
    });
    const mentionedAgentIds = await this.groupMembersService.resolveMentionedAgentIds({
      conversationId: parsed.conversationId,
      mentionedAgentIds: parsed.mentionedAgentIds,
      ownerUserId: access.ownerUserId,
      workspaceId: parsed.workspaceId
    });
    const mentionedUserIds = await this.channelMembersService.resolveMentionedUserIds({
      actorUserId,
      channelId: parsed.conversationId,
      mentionedUserIds: parsed.mentionedUserIds,
      workspaceId: parsed.workspaceId
    });

    return this.createStored({
      authorUserId: actorUserId,
      content: parsed.content,
      conversationId: parsed.conversationId,
      id: randomUUID(),
      mentionedAgentIds,
      mentionedUserIds,
      ownerUserId: access.ownerUserId,
      role: parsed.role,
      sourceAgentId: null,
      threadParentMessageId: parsed.threadParentMessageId,
      workspaceId: parsed.workspaceId
    }, actorUserId);
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
      authorUserId: null,
      content: sanitizeAssistantVisibleContent(input.content),
      conversationId: input.conversationId,
      id: input.id,
      mentionedAgentIds: [],
      mentionedUserIds: [],
      ownerUserId: input.ownerUserId,
      role: "assistant",
      sourceAgentId: input.sourceAgentId,
      threadParentMessageId: null,
      workspaceId: input.workspaceId
    });
  }

  async createStored(
    input: CreateStoredMessageInput,
    currentUserId?: string
  ): Promise<Message> {
    const parsed = messageSchema
      .omit({
        author: true,
        createdAt: true,
        isPinned: true
      })
      .extend({
        content: z.string().trim().min(1),
        isPinned: z.boolean().default(false)
      })
      .parse({
        authorUserId: input.authorUserId,
        content: input.content,
        conversationId: input.conversationId,
        id: input.id,
        mentionedAgentIds: input.mentionedAgentIds,
        mentionedUserIds: input.mentionedUserIds,
        ownerUserId: input.ownerUserId,
        role: input.role,
        sourceAgentId: input.sourceAgentId,
        threadParentMessageId: input.threadParentMessageId,
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
          mentionedUserIds: parsed.mentionedUserIds,
          authorUserId: parsed.authorUserId,
          ownerUserId: parsed.ownerUserId,
          role: parsed.role,
          sourceAgentId: parsed.sourceAgentId,
          threadParentMessageId: parsed.threadParentMessageId,
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
      const message = mapMessageRow(inserted, currentUserId);
      await this.multiAgentHarnessService.mirrorMessage(message, tx);

      return message;
    });
  }

  async list(input: unknown): Promise<Message[]> {
    const parsed = messageHistoryQuerySchema.parse(input);
    const access = await this.resolveReadAccessOrNotFound({
      actorUserId: parsed.ownerUserId,
      channelId: parsed.conversationId,
      workspaceId: parsed.workspaceId
    });
    const result = await this.messagesRepository.listMessages(
      parsed.conversationId,
      parsed.workspaceId,
      access.ownerUserId,
      parsed.ownerUserId
    );

    return result.map((row) => mapMessageRow(row, parsed.ownerUserId));
  }

  async pin(
    messageId: string,
    workspaceId: string,
    ownerUserId: string
  ): Promise<PinMessageResponse> {
    const parsedMessageId = messageIdSchema.parse(messageId);
    const parsedWorkspaceId = workspaceIdSchema.parse(workspaceId);
    const target = await this.messagesRepository.findMessageTarget(
      parsedMessageId,
      parsedWorkspaceId
    );

    if (!target) {
      throw new NotFoundException(
        `Message ${parsedMessageId} was not found in workspace ${parsedWorkspaceId}`
      );
    }

    const access = await this.resolveReadAccessOrNotFound({
      actorUserId: ownerUserId,
      channelId: target.conversation_id,
      workspaceId: parsedWorkspaceId
    });

    if (access.permission === "read") {
      throw new ForbiddenException("你在这个频道里只有只读权限，不能固定消息。");
    }

    return this.database.transaction(async (tx) => {
      const messageRow = await this.messagesRepository.pinMessage(
        parsedMessageId,
        parsedWorkspaceId,
        target.owner_user_id,
        ownerUserId,
        tx
      );

      if (!messageRow) {
        throw new NotFoundException(
          `Message ${parsedMessageId} was not found in workspace ${parsedWorkspaceId}`
        );
      }

      const message = mapMessageRow(messageRow, ownerUserId);
      const pinnedMessageIds = await this.messagesRepository.appendPinnedMessageId(
        message.conversationId,
        message.id,
        parsedWorkspaceId,
        target.owner_user_id,
        tx
      );

      return {
        message,
        pinnedMessageIds
      };
    });
  }

  async getThread(
    messageId: string,
    workspaceId: string,
    actorUserId: string
  ): Promise<MessageThread> {
    const parsedMessageId = messageIdSchema.parse(messageId);
    const parsedWorkspaceId = workspaceIdSchema.parse(workspaceId);
    const target = await this.messagesRepository.findMessageTarget(
      parsedMessageId,
      parsedWorkspaceId
    );

    if (!target) {
      throw new NotFoundException("要查看的消息不存在或已不可用。");
    }

    await this.channelMembersService.assertCanRead({
      actorUserId,
      channelId: target.conversation_id,
      workspaceId: parsedWorkspaceId
    });

    const parentMessageId = target.thread_parent_message_id ?? parsedMessageId;
    const parent = await this.messagesRepository.findMessageById(
      parentMessageId,
      parsedWorkspaceId,
      target.owner_user_id,
      actorUserId
    );

    if (!parent) {
      throw new NotFoundException("线程主消息不存在或已不可用。");
    }

    const replies = await this.messagesRepository.listThreadReplies(
      parentMessageId,
      parsedWorkspaceId,
      target.owner_user_id,
      actorUserId
    );

    return messageThreadSchema.parse({
      parent: mapMessageRow(parent, actorUserId),
      replies: replies.map((row) => mapMessageRow(row, actorUserId))
    });
  }

  async toggleReaction(
    messageId: string,
    input: unknown,
    actorUserId: string
  ): Promise<Message> {
    const parsedMessageId = messageIdSchema.parse(messageId);
    const parsed = toggleMessageReactionInputSchema.parse(input);
    const target = await this.messagesRepository.findMessageTarget(
      parsedMessageId,
      parsed.workspaceId
    );

    if (!target) {
      throw new NotFoundException("要回应的消息不存在或已不可用。");
    }

    await this.channelMembersService.assertCanSend({
      actorUserId,
      channelId: target.conversation_id,
      workspaceId: parsed.workspaceId
    });

    const existingReaction = await this.messagesRepository.findReaction({
      emoji: parsed.emoji,
      messageId: parsedMessageId,
      userId: actorUserId
    });

    if (existingReaction) {
      await this.messagesRepository.deleteReaction({
        emoji: parsed.emoji,
        messageId: parsedMessageId,
        userId: actorUserId
      });
    } else {
      await this.messagesRepository.insertReaction({
        emoji: parsed.emoji,
        id: randomUUID(),
        messageId: parsedMessageId,
        userId: actorUserId,
        workspaceId: parsed.workspaceId
      });
    }

    const updated = await this.messagesRepository.findMessageById(
      parsedMessageId,
      parsed.workspaceId,
      target.owner_user_id,
      actorUserId
    );

    return mapMessageRow(updated ?? undefined, actorUserId);
  }

  private async touchConversation(
    conversationId: string,
    workspaceId: string,
    ownerUserId: string,
    executor?: DatabaseExecutor
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

  private async resolveReadAccessOrNotFound(input: {
    actorUserId: string;
    channelId: string;
    workspaceId: string;
  }): Promise<ChannelAccess> {
    try {
      return await this.channelMembersService.assertCanRead(input);
    } catch (error) {
      if (error instanceof ForbiddenException) {
        const wasRemoved = await this.channelMembersService.wasRemovedHumanMember(input);

        if (wasRemoved) {
          throw error;
        }

        throw new NotFoundException("频道不存在或已不可用。");
      }

      throw error;
    }
  }

  private async assertThreadParent(input: {
    conversationId: string;
    ownerUserId: string;
    threadParentMessageId: string | null;
    workspaceId: string;
  }): Promise<void> {
    if (!input.threadParentMessageId) {
      return;
    }

    const belongsToChannel = await this.messagesRepository.messageBelongsToChannel({
      conversationId: input.conversationId,
      messageId: input.threadParentMessageId,
      ownerUserId: input.ownerUserId,
      workspaceId: input.workspaceId
    });

    if (!belongsToChannel) {
      throw new BadRequestException("回复的消息必须属于当前频道。");
    }
  }

}

function mapMessageRow(row: MessageRow | undefined, currentUserId?: string): Message {
  if (!row) {
    throw new Error("Message row not found");
  }

  return messageSchema.parse({
    author: buildMessageAuthor(row, currentUserId),
    authorUserId: row.author_user_id,
    content: row.content,
    conversationId: row.conversation_id,
    createdAt: row.created_at,
    id: row.id,
    isPinned: row.is_pinned,
    mentionedAgentIds: row.mentioned_agent_ids ?? [],
    mentionedUserIds: row.mentioned_user_ids ?? [],
    ownerUserId: row.owner_user_id,
    reactions: row.reactions ?? [],
    role: row.role,
    sourceAgentId: row.source_agent_id,
    threadLastReplyAt: row.thread_last_reply_at,
    threadParentMessageId: row.thread_parent_message_id,
    threadReplyCount: row.thread_reply_count ?? 0,
    workspaceId: row.workspace_id
  });
}

function buildMessageAuthor(
  row: MessageRow,
  currentUserId?: string
): Message["author"] {
  if (row.role === "system") {
    return {
      displayName: "系统",
      kind: "system"
    };
  }

  if (row.role === "user" && row.author_user_id) {
    return {
      avatarUrl: null,
      displayName:
        row.author_user_id === currentUserId
          ? "你"
          : row.author_display_name ?? "同事",
      isCurrentUser: row.author_user_id === currentUserId,
      kind: "human",
      userId: row.author_user_id
    };
  }

  if (row.role === "assistant" && row.source_agent_id) {
    return {
      avatarUrl: null,
      displayName: row.source_agent_name ?? "AI 同事",
      kind: "ai",
      teammateId: row.source_agent_id
    };
  }

  return null;
}
