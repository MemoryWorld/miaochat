import { randomUUID } from "node:crypto";

import { Inject, Injectable, NotFoundException } from "@nestjs/common";

import {
  createMessageInputSchema,
  messageIdSchema,
  messageSchema,
  workspaceIdSchema,
  type Message
} from "@agenthub/contracts";
import type { PoolClient } from "pg";
import { z } from "zod";

import { DatabaseService } from "../database/database.service.js";

type MessageRow = {
  content: string;
  conversation_id: string;
  created_at: Date;
  id: string;
  is_pinned: boolean;
  role: Message["role"];
  source_agent_id: string | null;
  workspace_id: string;
};

type CreateStoredMessageInput = {
  content: string;
  conversationId: string;
  id: string;
  role: Message["role"];
  sourceAgentId: string | null;
  workspaceId: string;
};

const messageHistoryQuerySchema = z.object({
  conversationId: z.string().min(1),
  workspaceId: workspaceIdSchema.default("default-workspace")
});

export type PinMessageResponse = {
  message: Message;
  pinnedMessageIds: string[];
};

@Injectable()
export class MessagesService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async create(input: unknown): Promise<Message> {
    const parsed = createMessageInputSchema.parse(input);

    return this.createStored({
      content: parsed.content,
      conversationId: parsed.conversationId,
      id: randomUUID(),
      role: parsed.role,
      sourceAgentId: null,
      workspaceId: parsed.workspaceId
    });
  }

  async createAssistantMessage(input: {
    content: string;
    conversationId: string;
    id: string;
    sourceAgentId: string;
    workspaceId: string;
  }): Promise<Message> {
    return this.createStored({
      content: input.content,
      conversationId: input.conversationId,
      id: input.id,
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
        role: input.role,
        sourceAgentId: input.sourceAgentId,
        workspaceId: input.workspaceId
      });

    return this.database.withClient(async (client) => {
      await client.query("BEGIN");

      try {
        const inserted = await client.query<MessageRow>(
          `
            INSERT INTO messages (
              id,
              conversation_id,
              role,
              content,
              source_agent_id,
              is_pinned,
              workspace_id
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING
              id,
              conversation_id,
              role,
              content,
              created_at,
              is_pinned,
              source_agent_id,
              workspace_id
          `,
          [
            parsed.id,
            parsed.conversationId,
            parsed.role,
            parsed.content,
            parsed.sourceAgentId,
            false,
            parsed.workspaceId
          ]
        );

        await this.touchConversation(client, parsed.conversationId, parsed.workspaceId);
        await client.query("COMMIT");
        return mapMessageRow(inserted.rows[0]);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    });
  }

  async list(input: unknown): Promise<Message[]> {
    const parsed = messageHistoryQuerySchema.parse(input);
    const result = await this.database.query<MessageRow>(
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
        WHERE conversation_id = $1 AND workspace_id = $2
        ORDER BY created_at ASC
      `,
      [parsed.conversationId, parsed.workspaceId]
    );

    return result.rows.map(mapMessageRow);
  }

  async pin(messageId: string, workspaceId: string): Promise<PinMessageResponse> {
    const parsedMessageId = messageIdSchema.parse(messageId);
    const parsedWorkspaceId = workspaceIdSchema.parse(workspaceId);

    return this.database.withClient(async (client) => {
      await client.query("BEGIN");

      try {
        const messageResult = await client.query<MessageRow>(
          `
            UPDATE messages
            SET is_pinned = true, updated_at = now()
            WHERE id = $1 AND workspace_id = $2
            RETURNING
              id,
              conversation_id,
              role,
              content,
              created_at,
              is_pinned,
              source_agent_id,
              workspace_id
          `,
          [parsedMessageId, parsedWorkspaceId]
        );

        if (!messageResult.rows[0]) {
          throw new NotFoundException(
            `Message ${parsedMessageId} was not found in workspace ${parsedWorkspaceId}`
          );
        }

        const message = mapMessageRow(messageResult.rows[0]);
        const conversationResult = await client.query<{
          pinned_message_ids: string[];
        }>(
          `
            UPDATE conversations
            SET
              pinned_message_ids = CASE
                WHEN pinned_message_ids @> to_jsonb(ARRAY[$2]::text[])
                  THEN pinned_message_ids
                ELSE pinned_message_ids || to_jsonb(ARRAY[$2]::text[])
              END,
              updated_at = now()
            WHERE id = $1 AND workspace_id = $3
            RETURNING pinned_message_ids
          `,
          [message.conversationId, message.id, parsedWorkspaceId]
        );

        await client.query("COMMIT");

        return {
          message,
          pinnedMessageIds: conversationResult.rows[0]?.pinned_message_ids ?? []
        };
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    });
  }

  private async touchConversation(
    client: PoolClient,
    conversationId: string,
    workspaceId: string
  ): Promise<void> {
    await client.query(
      `
        UPDATE conversations
        SET updated_at = now()
        WHERE id = $1 AND workspace_id = $2
      `,
      [conversationId, workspaceId]
    );
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
    role: row.role,
    sourceAgentId: row.source_agent_id,
    workspaceId: row.workspace_id
  });
}
