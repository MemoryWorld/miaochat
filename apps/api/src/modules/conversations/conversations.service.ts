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
  id: string;
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

  async create(input: unknown): Promise<Conversation> {
    const parsed = createConversationInputSchema.parse(input);
    const workspaceId = workspaceIdSchema.parse(parsed.workspaceId);

    return this.database.withClient(async (client) => {
      await client.query("BEGIN");

      try {
        const participants = await this.resolveParticipants(
          client,
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
              id,
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
            "system-user",
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

  async list(workspaceId: string): Promise<Conversation[]> {
    const parsedWorkspaceId = workspaceIdSchema.parse(workspaceId);
    const conversations = await this.database.query<ConversationRow>(
      `
        SELECT
          id,
          mode,
          owner_user_id,
          pinned_message_ids,
          title,
          updated_at,
          workspace_id
        FROM conversations
        WHERE workspace_id = $1
        ORDER BY updated_at DESC
      `,
      [parsedWorkspaceId]
    );
    const participants = await this.database.query<ConversationAgentRow>(
      `
        SELECT
          conversation_id,
          agent_id,
          agent_name
        FROM conversation_agents
        WHERE workspace_id = $1
      `,
      [parsedWorkspaceId]
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

  private async resolveParticipants(
    client: PoolClient,
    workspaceId: string,
    agentIds: string[]
  ): Promise<ConversationAgentMember[]> {
    const result = await client.query<CustomAgentRow>(
      `
        SELECT id, name
        FROM custom_agents
        WHERE workspace_id = $1 AND id = ANY($2::text[])
      `,
      [workspaceId, agentIds]
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
    id: row.id,
    mode: row.mode,
    ownerUserId: row.owner_user_id,
    participants,
    pinnedMessageIds: row.pinned_message_ids ?? [],
    title: row.title,
    updatedAt: row.updated_at,
    workspaceId: row.workspace_id
  });
}
