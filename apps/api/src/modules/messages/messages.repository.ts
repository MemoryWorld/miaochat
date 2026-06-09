import { Inject, Injectable } from "@nestjs/common";
import { sql } from "drizzle-orm";

import type { Message } from "@agenthub/contracts";

import {
  DatabaseService,
  type DatabaseExecutor
} from "../database/database.service.js";

export type MessageRow = {
  author_display_name?: string | null;
  author_user_id: string | null;
  content: string;
  conversation_id: string;
  created_at: Date;
  id: string;
  is_pinned: boolean;
  mentioned_agent_ids: string[];
  mentioned_user_ids: string[];
  owner_user_id: string;
  reactions: Message["reactions"];
  role: Message["role"];
  source_agent_id: string | null;
  source_agent_name?: string | null;
  thread_last_reply_at: Date | null;
  thread_parent_message_id: string | null;
  thread_reply_count: number;
  workspace_id: string;
};

export type MessageTargetRow = {
  conversation_id: string;
  owner_user_id: string;
  role: string;
  thread_parent_message_id: string | null;
  workspace_id: string;
};

export type MessageRegenerationRow = {
  conversation_id: string;
  role: string;
  workspace_id: string;
};

@Injectable()
export class MessagesRepository {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async createMessage(
    input: {
      content: string;
      conversationId: string;
      id: string;
      isPinned: boolean;
      mentionedAgentIds: string[];
      mentionedUserIds: string[];
      authorUserId: string | null;
      ownerUserId: string;
      role: Message["role"];
      sourceAgentId: string | null;
      threadParentMessageId: string | null;
      workspaceId: string;
    },
    executor?: DatabaseExecutor
  ): Promise<MessageRow> {
    const result = await this.resolveExecutor(executor).execute<MessageRow>(sql`
      INSERT INTO messages (
        id,
        conversation_id,
        role,
        content,
        mentioned_agent_ids,
        mentioned_user_ids,
        author_user_id,
        owner_user_id,
        source_agent_id,
        thread_parent_message_id,
        is_pinned,
        workspace_id
      )
      VALUES (
        ${input.id},
        ${input.conversationId},
        ${input.role},
        ${input.content},
        ${JSON.stringify(input.mentionedAgentIds)}::jsonb,
        ${JSON.stringify(input.mentionedUserIds)}::jsonb,
        ${input.authorUserId},
        ${input.ownerUserId},
        ${input.sourceAgentId},
        ${input.threadParentMessageId},
        ${input.isPinned},
        ${input.workspaceId}
      )
      RETURNING
        id,
        conversation_id,
        role,
        content,
        mentioned_agent_ids,
        mentioned_user_ids,
        author_user_id,
        NULL::text AS author_display_name,
        created_at,
        is_pinned,
        owner_user_id,
        '[]'::jsonb AS reactions,
        source_agent_id,
        NULL::text AS source_agent_name,
        NULL::timestamptz AS thread_last_reply_at,
        thread_parent_message_id,
        0::int AS thread_reply_count,
        workspace_id
    `);

    return requireRow(result.rows[0], "Message row not found after insert.");
  }

  async listMessages(
    conversationId: string,
    workspaceId: string,
    ownerUserId: string,
    currentUserId: string
  ): Promise<MessageRow[]> {
    const result = await this.database.execute<MessageRow>(sql`
      SELECT
        ${messageSelectFields()}
      FROM messages
      ${messageSelectJoins(currentUserId)}
      WHERE messages.conversation_id = ${conversationId}
        AND messages.workspace_id = ${workspaceId}
        AND messages.owner_user_id = ${ownerUserId}
        AND messages.thread_parent_message_id IS NULL
      ORDER BY
        messages.created_at ASC,
        CASE messages.role
          WHEN 'user' THEN 0
          WHEN 'system' THEN 1
          ELSE 2
        END ASC,
        messages.id ASC
    `);

    return result.rows;
  }

  async findMessageById(
    messageId: string,
    workspaceId: string,
    ownerUserId: string,
    currentUserId: string,
    executor?: DatabaseExecutor
  ): Promise<MessageRow | null> {
    const result = await this.resolveExecutor(executor).execute<MessageRow>(sql`
      SELECT
        ${messageSelectFields()}
      FROM messages
      ${messageSelectJoins(currentUserId)}
      WHERE messages.id = ${messageId}
        AND messages.workspace_id = ${workspaceId}
        AND messages.owner_user_id = ${ownerUserId}
      LIMIT 1
    `);

    return result.rows[0] ?? null;
  }

  async listThreadReplies(
    parentMessageId: string,
    workspaceId: string,
    ownerUserId: string,
    currentUserId: string
  ): Promise<MessageRow[]> {
    const result = await this.database.execute<MessageRow>(sql`
      SELECT
        ${messageSelectFields()}
      FROM messages
      ${messageSelectJoins(currentUserId)}
      WHERE messages.thread_parent_message_id = ${parentMessageId}
        AND messages.workspace_id = ${workspaceId}
        AND messages.owner_user_id = ${ownerUserId}
      ORDER BY
        messages.created_at ASC,
        CASE messages.role
          WHEN 'user' THEN 0
          WHEN 'system' THEN 1
          ELSE 2
        END ASC,
        messages.id ASC
    `);

    return result.rows;
  }

  async findMessageTarget(
    messageId: string,
    workspaceId: string
  ): Promise<MessageTargetRow | null> {
    const result = await this.database.execute<MessageTargetRow>(sql`
      SELECT
        conversation_id,
        owner_user_id,
        role,
        thread_parent_message_id,
        workspace_id
      FROM messages
      WHERE id = ${messageId}
        AND workspace_id = ${workspaceId}
      LIMIT 1
    `);

    return result.rows[0] ?? null;
  }

  async messageBelongsToChannel(input: {
    conversationId: string;
    messageId: string;
    ownerUserId: string;
    workspaceId: string;
  }): Promise<boolean> {
    const result = await this.database.execute<{ id: string }>(sql`
      SELECT id
      FROM messages
      WHERE id = ${input.messageId}
        AND conversation_id = ${input.conversationId}
        AND workspace_id = ${input.workspaceId}
        AND owner_user_id = ${input.ownerUserId}
      LIMIT 1
    `);

    return Boolean(result.rows[0]);
  }

  async pinMessage(
    messageId: string,
    workspaceId: string,
    ownerUserId: string,
    currentUserId: string,
    executor?: DatabaseExecutor
  ): Promise<MessageRow | null> {
    const result = await this.resolveExecutor(executor).execute(sql`
      UPDATE messages
      SET is_pinned = true, updated_at = now()
      WHERE id = ${messageId}
        AND workspace_id = ${workspaceId}
        AND owner_user_id = ${ownerUserId}
    `);

    if ((result.rowCount ?? 0) === 0) {
      return null;
    }

    return this.findMessageById(
      messageId,
      workspaceId,
      ownerUserId,
      currentUserId,
      executor
    );
  }

  async appendPinnedMessageId(
    conversationId: string,
    messageId: string,
    workspaceId: string,
    ownerUserId: string,
    executor?: DatabaseExecutor
  ): Promise<string[]> {
    const result = await this.resolveExecutor(executor).execute<{
      pinned_message_ids: string[];
    }>(sql`
      UPDATE conversations
      SET
        pinned_message_ids = CASE
          WHEN pinned_message_ids @> jsonb_build_array(CAST(${messageId} AS text))
            THEN pinned_message_ids
          ELSE pinned_message_ids || jsonb_build_array(CAST(${messageId} AS text))
        END,
        updated_at = now()
      WHERE id = ${conversationId}
        AND workspace_id = ${workspaceId}
        AND owner_user_id = ${ownerUserId}
      RETURNING pinned_message_ids
    `);

    return result.rows[0]?.pinned_message_ids ?? [];
  }

  async touchConversation(
    conversationId: string,
    workspaceId: string,
    ownerUserId: string,
    executor?: DatabaseExecutor
  ): Promise<number> {
    const result = await this.resolveExecutor(executor).execute(sql`
      UPDATE conversations
      SET updated_at = now()
      WHERE id = ${conversationId}
        AND workspace_id = ${workspaceId}
        AND owner_user_id = ${ownerUserId}
    `);

    return result.rowCount ?? 0;
  }

  async findReaction(input: {
    emoji: string;
    messageId: string;
    userId: string;
  }): Promise<{ id: string } | null> {
    const result = await this.database.execute<{ id: string }>(sql`
      SELECT id
      FROM message_reactions
      WHERE message_id = ${input.messageId}
        AND user_id = ${input.userId}
        AND emoji = ${input.emoji}
      LIMIT 1
    `);

    return result.rows[0] ?? null;
  }

  async insertReaction(input: {
    emoji: string;
    id: string;
    messageId: string;
    userId: string;
    workspaceId: string;
  }): Promise<void> {
    await this.database.execute(sql`
      INSERT INTO message_reactions (
        id,
        message_id,
        workspace_id,
        user_id,
        emoji
      )
      VALUES (
        ${input.id},
        ${input.messageId},
        ${input.workspaceId},
        ${input.userId},
        ${input.emoji}
      )
      ON CONFLICT (message_id, user_id, emoji) DO NOTHING
    `);
  }

  async deleteReaction(input: {
    emoji: string;
    messageId: string;
    userId: string;
  }): Promise<void> {
    await this.database.execute(sql`
      DELETE FROM message_reactions
      WHERE message_id = ${input.messageId}
        AND user_id = ${input.userId}
        AND emoji = ${input.emoji}
    `);
  }

  async findMessageForRegeneration(
    messageId: string,
    workspaceId: string,
    ownerUserId: string
  ): Promise<MessageRegenerationRow | null> {
    const result = await this.database.execute<MessageRegenerationRow>(sql`
      SELECT conversation_id, role, workspace_id
      FROM messages
      WHERE id = ${messageId}
        AND workspace_id = ${workspaceId}
        AND owner_user_id = ${ownerUserId}
    `);

    return result.rows[0] ?? null;
  }

  async listPinnedMessages(
    conversationId: string,
    workspaceId: string,
    ownerUserId: string
  ): Promise<MessageRow[]> {
    const result = await this.database.execute<MessageRow>(sql`
      SELECT
        ${messageSelectFields()}
      FROM messages
      ${messageSelectJoins(ownerUserId)}
      WHERE messages.conversation_id = ${conversationId}
        AND messages.workspace_id = ${workspaceId}
        AND messages.owner_user_id = ${ownerUserId}
        AND messages.is_pinned = true
      ORDER BY messages.created_at ASC
    `);

    return result.rows;
  }

  async listRecentContextMessages(input: {
    conversationId: string;
    excludeMessageId?: string;
    limit: number;
    ownerUserId: string;
    workspaceId: string;
  }): Promise<MessageRow[]> {
    const result = await this.database.execute<MessageRow>(sql`
      SELECT *
      FROM (
        SELECT
          ${messageSelectFields()}
        FROM messages
        ${messageSelectJoins(input.ownerUserId)}
        WHERE messages.conversation_id = ${input.conversationId}
          AND messages.workspace_id = ${input.workspaceId}
          AND messages.owner_user_id = ${input.ownerUserId}
          AND messages.thread_parent_message_id IS NULL
          AND messages.content <> ''
          AND (${input.excludeMessageId ?? null}::text IS NULL OR messages.id <> ${input.excludeMessageId ?? null})
        ORDER BY messages.created_at DESC, messages.id DESC
        LIMIT ${input.limit}
      ) AS recent_context_messages
      ORDER BY created_at ASC, id ASC
    `);

    return result.rows;
  }

  private resolveExecutor(executor?: DatabaseExecutor): DatabaseExecutor {
    return executor ?? this.database;
  }
}

function messageSelectFields() {
  return sql`
    messages.id,
    messages.conversation_id,
    messages.role,
    messages.content,
    messages.mentioned_agent_ids,
    messages.mentioned_user_ids,
    messages.author_user_id,
    users.display_name AS author_display_name,
    messages.created_at,
    messages.is_pinned,
    messages.owner_user_id,
    COALESCE(reaction_summary.reactions, '[]'::jsonb) AS reactions,
    messages.source_agent_id,
    conversation_agents.agent_name AS source_agent_name,
    thread_summary.thread_last_reply_at,
    messages.thread_parent_message_id,
    COALESCE(thread_summary.thread_reply_count, 0)::int AS thread_reply_count,
    messages.workspace_id
  `;
}

function messageSelectJoins(currentUserId: string) {
  return sql`
    LEFT JOIN users
      ON users.id = messages.author_user_id
    LEFT JOIN conversation_agents
      ON conversation_agents.conversation_id = messages.conversation_id
      AND conversation_agents.workspace_id = messages.workspace_id
      AND conversation_agents.agent_id = messages.source_agent_id
    LEFT JOIN LATERAL (
      SELECT
        COALESCE(
          jsonb_agg(
            jsonb_build_object(
              'emoji',
              grouped_reactions.emoji,
              'count',
              grouped_reactions.reaction_count,
              'reactedByCurrentUser',
              grouped_reactions.reacted_by_current_user
            )
            ORDER BY grouped_reactions.emoji ASC
          ),
          '[]'::jsonb
        ) AS reactions
      FROM (
        SELECT
          message_reactions.emoji,
          count(*)::int AS reaction_count,
          bool_or(message_reactions.user_id = ${currentUserId}) AS reacted_by_current_user
        FROM message_reactions
        WHERE message_reactions.message_id = messages.id
        GROUP BY message_reactions.emoji
      ) AS grouped_reactions
    ) AS reaction_summary ON true
    LEFT JOIN LATERAL (
      SELECT
        count(*)::int AS thread_reply_count,
        max(thread_replies.created_at) AS thread_last_reply_at
      FROM messages AS thread_replies
      WHERE thread_replies.thread_parent_message_id = messages.id
        AND thread_replies.workspace_id = messages.workspace_id
        AND thread_replies.owner_user_id = messages.owner_user_id
    ) AS thread_summary ON true
  `;
}

function requireRow<Row>(row: Row | undefined, message: string): Row {
  if (!row) {
    throw new Error(message);
  }

  return row;
}
