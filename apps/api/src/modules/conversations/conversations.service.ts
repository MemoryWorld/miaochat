import { randomUUID } from "node:crypto";

import { Inject, Injectable } from "@nestjs/common";

import {
  conversationSchema,
  createConversationInputSchema,
  workspaceIdSchema,
  type Conversation,
  type ConversationAgentMember
} from "@agenthub/contracts";
import type { PoolClient } from "pg";

import { DatabaseService } from "../database/database.service.js";

type ConversationRow = {
  archived_at: Date | null;
  id: string;
  is_pinned: boolean;
  mode: Conversation["mode"];
  owner_user_id: string;
  pinned_message_ids: string[];
  title: string;
  updated_at: Date;
  workspace_id: string;
};

type ConversationAgentRow = {
  agent_id: string;
  agent_name: string;
  conversation_id: string;
};

type CustomAgentRow = {
  id: string;
  name: string;
};

@Injectable()
export class ConversationsService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async create(input: unknown, ownerUserId: string): Promise<Conversation> {
    const parsed = createConversationInputSchema.parse(input);
    const workspaceId = workspaceIdSchema.parse(parsed.workspaceId);

    return this.database.withClient(async (client) => {
      await client.query("BEGIN");

      try {
        const participants = await this.resolveParticipants(
          client,
          ownerUserId,
          workspaceId,
          parsed.agentIds
        );
        const conversationId = randomUUID();
        const title =
          parsed.title?.trim() || buildConversationTitle(parsed.mode, participants);

        const inserted = await client.query<ConversationRow>(
          `
            INSERT INTO conversations (
              id,
              mode,
              owner_user_id,
              pinned_message_ids,
              title,
              workspace_id
            )
            VALUES ($1, $2, $3, $4::jsonb, $5, $6)
            RETURNING
              archived_at,
              id,
              is_pinned,
              mode,
              owner_user_id,
              pinned_message_ids,
              title,
              updated_at,
              workspace_id
          `,
          [
            conversationId,
            parsed.mode,
            ownerUserId,
            JSON.stringify([]),
            title,
            workspaceId
          ]
        );

        for (const participant of participants) {
          await client.query(
            `
              INSERT INTO conversation_agents (
                conversation_id,
                agent_id,
                agent_name,
                workspace_id
              )
              VALUES ($1, $2, $3, $4)
            `,
            [conversationId, participant.agentId, participant.agentName, workspaceId]
          );
        }

        await client.query("COMMIT");
        return mapConversationRow(inserted.rows[0], participants);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    });
  }

  async list(
    workspaceId: string,
    ownerUserId: string,
    options: { includeArchived?: boolean; search?: string } = {}
  ): Promise<Conversation[]> {
    const parsedWorkspaceId = workspaceIdSchema.parse(workspaceId);
    const trimmedSearch = options.search?.trim() ?? "";
    const search = trimmedSearch.length > 0 ? `%${trimmedSearch.toLowerCase()}%` : null;
    const includeArchived = Boolean(options.includeArchived);

    const conversations = await this.database.query<ConversationRow>(
      `
        SELECT
          id,
          mode,
          owner_user_id,
          pinned_message_ids,
          title,
          updated_at,
          workspace_id,
          is_pinned,
          archived_at
        FROM conversations
        WHERE workspace_id = $1
          AND owner_user_id = $2
          AND ($3 OR archived_at IS NULL)
          AND ($4::text IS NULL OR lower(title) LIKE $4)
        ORDER BY is_pinned DESC, updated_at DESC
      `,
      [parsedWorkspaceId, ownerUserId, includeArchived, search]
    );

    if (conversations.rows.length === 0) {
      return [];
    }

    const participants = await this.database.query<ConversationAgentRow>(
      `
        SELECT
          conversation_agents.conversation_id,
          conversation_agents.agent_id,
          conversation_agents.agent_name
        FROM conversation_agents
        INNER JOIN conversations
          ON conversations.id = conversation_agents.conversation_id
          AND conversations.workspace_id = conversation_agents.workspace_id
        WHERE conversation_agents.workspace_id = $1
          AND conversations.owner_user_id = $2
      `,
      [parsedWorkspaceId, ownerUserId]
    );

    const participantMap = new Map<string, ConversationAgentMember[]>();
    for (const row of participants.rows) {
      const current = participantMap.get(row.conversation_id) ?? [];
      current.push({
        agentId: row.agent_id,
        agentName: row.agent_name
      });
      participantMap.set(row.conversation_id, current);
    }

    return conversations.rows.map((row) =>
      mapConversationRow(row, participantMap.get(row.id) ?? [])
    );
  }

  async setPinned(
    workspaceId: string,
    ownerUserId: string,
    conversationId: string,
    isPinned: boolean
  ): Promise<Conversation> {
    return this.applyMutation(workspaceId, ownerUserId, conversationId, {
      isPinned
    });
  }

  async archive(
    workspaceId: string,
    ownerUserId: string,
    conversationId: string
  ): Promise<Conversation> {
    return this.applyMutation(workspaceId, ownerUserId, conversationId, {
      archived: true
    });
  }

  async restore(
    workspaceId: string,
    ownerUserId: string,
    conversationId: string
  ): Promise<Conversation> {
    return this.applyMutation(workspaceId, ownerUserId, conversationId, {
      archived: false
    });
  }

  private async applyMutation(
    workspaceId: string,
    ownerUserId: string,
    conversationId: string,
    change: { archived?: boolean; isPinned?: boolean }
  ): Promise<Conversation> {
    const parsedWorkspaceId = workspaceIdSchema.parse(workspaceId);

    const setClauses: string[] = ["updated_at = now()"];
    const values: unknown[] = [conversationId, parsedWorkspaceId, ownerUserId];

    if (change.isPinned !== undefined) {
      values.push(change.isPinned);
      setClauses.push(`is_pinned = $${values.length}`);
    }
    if (change.archived !== undefined) {
      if (change.archived) {
        setClauses.push("archived_at = now()");
      } else {
        setClauses.push("archived_at = NULL");
      }
    }

    const result = await this.database.query<ConversationRow>(
      `
        UPDATE conversations
        SET ${setClauses.join(", ")}
        WHERE id = $1 AND workspace_id = $2 AND owner_user_id = $3
        RETURNING
          archived_at,
          id,
          is_pinned,
          mode,
          owner_user_id,
          pinned_message_ids,
          title,
          updated_at,
          workspace_id
      `,
      values
    );

    if (!result.rows[0]) {
      throw new Error(
        `Conversation ${conversationId} was not found in workspace ${workspaceId}.`
      );
    }

    const participants = await this.database.query<ConversationAgentRow>(
      `
        SELECT conversation_id, agent_id, agent_name
        FROM conversation_agents
        WHERE conversation_id = $1 AND workspace_id = $2
      `,
      [conversationId, parsedWorkspaceId]
    );

    return mapConversationRow(
      result.rows[0],
      participants.rows.map((row) => ({
        agentId: row.agent_id,
        agentName: row.agent_name
      }))
    );
  }

  private async resolveParticipants(
    client: PoolClient,
    ownerUserId: string,
    workspaceId: string,
    agentIds: string[]
  ): Promise<ConversationAgentMember[]> {
    const result = await client.query<CustomAgentRow>(
      `
        SELECT id, name
        FROM custom_agents
        WHERE workspace_id = $1 AND owner_user_id = $2 AND id = ANY($3::text[])
      `,
      [workspaceId, ownerUserId, agentIds]
    );

    const namesById = new Map(result.rows.map((row) => [row.id, row.name]));

    return agentIds.map((agentId) => ({
      agentId,
      agentName: namesById.get(agentId) ?? agentId
    }));
  }
}

function buildConversationTitle(
  mode: Conversation["mode"],
  participants: ConversationAgentMember[]
): string {
  if (mode === "direct" && participants[0]) {
    return `${participants[0].agentName} session`;
  }

  if (participants.length === 0) {
    return "New conversation";
  }

  const participantNames = participants.slice(0, 2).map((entry) => entry.agentName);
  return `${participantNames.join(" + ")} group`;
}

function mapConversationRow(
  row: ConversationRow | undefined,
  participants: ConversationAgentMember[]
): Conversation {
  if (!row) {
    throw new Error("Conversation row not found");
  }

  return conversationSchema.parse({
    archivedAt: row.archived_at,
    id: row.id,
    isPinned: row.is_pinned ?? false,
    mode: row.mode,
    ownerUserId: row.owner_user_id,
    participants,
    pinnedMessageIds: row.pinned_message_ids ?? [],
    title: row.title,
    updatedAt: row.updated_at,
    workspaceId: row.workspace_id
  });
}
