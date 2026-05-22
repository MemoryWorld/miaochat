import { Inject, Injectable } from "@nestjs/common";
import { sql } from "drizzle-orm";

import type { Message } from "@agenthub/contracts";

import {
  DatabaseService,
  type DatabaseExecutor
} from "../database/database.service.js";

export type MessageRow = {
  content: string;
  conversation_id: string;
  created_at: Date;
  id: string;
  is_pinned: boolean;
  mentioned_agent_ids: string[];
  owner_user_id: string;
  role: Message["role"];
  source_agent_id: string | null;
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
      ownerUserId: string;
      role: Message["role"];
      sourceAgentId: string | null;
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
        owner_user_id,
        source_agent_id,
        is_pinned,
        workspace_id
      )
      VALUES (
        ${input.id},
        ${input.conversationId},
        ${input.role},
        ${input.content},
        ${JSON.stringify(input.mentionedAgentIds)}::jsonb,
        ${input.ownerUserId},
        ${input.sourceAgentId},
        ${input.isPinned},
        ${input.workspaceId}
      )
      RETURNING
        id,
        conversation_id,
        role,
        content,
        mentioned_agent_ids,
        created_at,
        is_pinned,
        owner_user_id,
        source_agent_id,
        workspace_id
    `);

    return requireRow(result.rows[0], "Message row not found after insert.");
  }

  async listMessages(
    conversationId: string,
    workspaceId: string,
    ownerUserId: string
  ): Promise<MessageRow[]> {
    const result = await this.database.execute<MessageRow>(sql`
      SELECT
        id,
        conversation_id,
        role,
        content,
        mentioned_agent_ids,
        created_at,
        is_pinned,
        owner_user_id,
        source_agent_id,
        workspace_id
      FROM messages
      WHERE conversation_id = ${conversationId}
        AND workspace_id = ${workspaceId}
        AND owner_user_id = ${ownerUserId}
      ORDER BY created_at ASC
    `);

    return result.rows;
  }

  async pinMessage(
    messageId: string,
    workspaceId: string,
    ownerUserId: string,
    executor?: DatabaseExecutor
  ): Promise<MessageRow | null> {
    const result = await this.resolveExecutor(executor).execute<MessageRow>(sql`
      UPDATE messages
      SET is_pinned = true, updated_at = now()
      WHERE id = ${messageId}
        AND workspace_id = ${workspaceId}
        AND owner_user_id = ${ownerUserId}
      RETURNING
        id,
        conversation_id,
        role,
        content,
        mentioned_agent_ids,
        created_at,
        is_pinned,
        owner_user_id,
        source_agent_id,
        workspace_id
    `);

    return result.rows[0] ?? null;
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
        id,
        conversation_id,
        role,
        content,
        mentioned_agent_ids,
        created_at,
        is_pinned,
        owner_user_id,
        source_agent_id,
        workspace_id
      FROM messages
      WHERE conversation_id = ${conversationId}
        AND workspace_id = ${workspaceId}
        AND owner_user_id = ${ownerUserId}
        AND is_pinned = true
      ORDER BY created_at ASC
    `);

    return result.rows;
  }

  private resolveExecutor(executor?: DatabaseExecutor): DatabaseExecutor {
    return executor ?? this.database;
  }
}

function requireRow<Row>(row: Row | undefined, message: string): Row {
  if (!row) {
    throw new Error(message);
  }

  return row;
}
