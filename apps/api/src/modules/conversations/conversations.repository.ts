import { Inject, Injectable } from "@nestjs/common";
import { sql } from "drizzle-orm";

import type { ConversationAgentMember, Conversation, ProviderId } from "@agenthub/contracts";

import {
  DatabaseService,
  type DatabaseExecutor
} from "../database/database.service.js";
import type { ConversationSharePermission } from "./conversation-shares.service.js";

export type ConversationRow = {
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

export type ConversationAgentRow = {
  agent_id: string;
  agent_name: string;
  conversation_id: string;
};

export type ConversationMemberRow = {
  agent_id: string | null;
  agent_name: string | null;
  mode: Conversation["mode"];
};

export type ConversationShareRow = {
  conversation_id: string;
  created_at: Date;
  created_by_user_id: string;
  permission: ConversationSharePermission;
  shared_with_user_id: string;
  workspace_id: string;
  workspace_owner_user_id: string;
};

export type OwnedConversationRow = {
  owner_user_id: string;
  workspace_id: string;
};

export type ResolvedConversationAgentRow = {
  agent_id: string;
  agent_name: string;
  mode: "direct" | "group";
  output_style: string;
  provider: ProviderId;
  scope_description: string | null;
  system_prompt: string;
};

type CustomAgentRow = {
  id: string;
  name: string;
};

@Injectable()
export class ConversationsRepository {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async createConversation(
    input: {
      id: string;
      mode: Conversation["mode"];
      ownerUserId: string;
      title: string;
      workspaceId: string;
    },
    executor?: DatabaseExecutor
  ): Promise<ConversationRow> {
    const result = await this.resolveExecutor(executor).execute<ConversationRow>(sql`
      INSERT INTO conversations (
        id,
        mode,
        owner_user_id,
        pinned_message_ids,
        title,
        workspace_id
      )
      VALUES (
        ${input.id},
        ${input.mode},
        ${input.ownerUserId},
        ${JSON.stringify([])}::jsonb,
        ${input.title},
        ${input.workspaceId}
      )
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
    `);

    return requireRow(result.rows[0], "Conversation row not found after insert.");
  }

  async insertConversationAgents(
    conversationId: string,
    workspaceId: string,
    participants: ConversationAgentMember[],
    executor?: DatabaseExecutor
  ): Promise<void> {
    const currentExecutor = this.resolveExecutor(executor);

    for (const participant of participants) {
      await currentExecutor.execute(sql`
        INSERT INTO conversation_agents (
          conversation_id,
          agent_id,
          agent_name,
          workspace_id
        )
        VALUES (
          ${conversationId},
          ${participant.agentId},
          ${participant.agentName},
          ${workspaceId}
        )
      `);
    }
  }

  async insertOwnerChannelMembership(
    input: {
      conversationId: string;
      ownerUserId: string;
      workspaceId: string;
    },
    executor?: DatabaseExecutor
  ): Promise<void> {
    await this.resolveExecutor(executor).execute(sql`
      INSERT INTO channel_user_memberships (
        id,
        channel_id,
        workspace_id,
        workspace_owner_user_id,
        user_id,
        role,
        permission,
        status,
        invited_by_user_id,
        joined_at
      )
      VALUES (
        ${`channel-owner:${input.conversationId}:${input.ownerUserId}`},
        ${input.conversationId},
        ${input.workspaceId},
        ${input.ownerUserId},
        ${input.ownerUserId},
        'owner',
        'manage',
        'active',
        ${input.ownerUserId},
        now()
      )
      ON CONFLICT DO NOTHING
    `);
  }

  async resolveParticipants(
    ownerUserId: string,
    workspaceId: string,
    agentIds: string[],
    executor?: DatabaseExecutor
  ): Promise<ConversationAgentMember[]> {
    if (agentIds.length === 0) {
      return [];
    }

    const result = await this.resolveExecutor(executor).execute<CustomAgentRow>(sql`
      SELECT id, name
      FROM custom_agents
      WHERE workspace_id = ${workspaceId}
        AND owner_user_id = ${ownerUserId}
        AND id IN (${sql.join(agentIds.map((agentId) => sql`${agentId}`), sql`, `)})
    `);

    const namesById = new Map(result.rows.map((row) => [row.id, row.name]));

    return agentIds.map((agentId) => ({
      agentId,
      agentName: namesById.get(agentId) ?? agentId
    }));
  }

  async listConversations(
    workspaceId: string,
    ownerUserId: string,
    options: { includeArchived: boolean; search: string | null }
  ): Promise<ConversationRow[]> {
    const conditions = [
      sql`workspace_id = ${workspaceId}`,
      sql`owner_user_id = ${ownerUserId}`
    ];

    if (!options.includeArchived) {
      conditions.push(sql`archived_at IS NULL`);
    }

    if (options.search) {
      conditions.push(sql`lower(title) LIKE ${options.search}`);
    }

    const result = await this.database.execute<ConversationRow>(sql`
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
      WHERE ${sql.join(conditions, sql` AND `)}
      ORDER BY is_pinned DESC, updated_at DESC
    `);

    return result.rows;
  }

  async listWorkspaceParticipants(
    workspaceId: string,
    ownerUserId: string
  ): Promise<ConversationAgentRow[]> {
    const result = await this.database.execute<ConversationAgentRow>(sql`
      SELECT
        conversation_agents.conversation_id,
        conversation_agents.agent_id,
        conversation_agents.agent_name
      FROM conversation_agents
      INNER JOIN conversations
        ON conversations.id = conversation_agents.conversation_id
        AND conversations.workspace_id = conversation_agents.workspace_id
      WHERE conversation_agents.workspace_id = ${workspaceId}
        AND conversations.owner_user_id = ${ownerUserId}
    `);

    return result.rows;
  }

  async listWorkspaceAgentNames(
    workspaceId: string,
    ownerUserId: string,
    executor?: DatabaseExecutor
  ): Promise<string[]> {
    const result = await this.resolveExecutor(executor).execute<{ name: string }>(sql`
      SELECT name
      FROM custom_agents
      WHERE workspace_id = ${workspaceId}
        AND owner_user_id = ${ownerUserId}
    `);

    return result.rows.map((row) => row.name);
  }

  async updateConversation(
    conversationId: string,
    workspaceId: string,
    ownerUserId: string,
    change: { archived?: boolean; isPinned?: boolean }
  ): Promise<ConversationRow | null> {
    const setClauses = [sql`updated_at = now()`];

    if (change.isPinned !== undefined) {
      setClauses.push(sql`is_pinned = ${change.isPinned}`);
    }

    if (change.archived !== undefined) {
      setClauses.push(change.archived ? sql`archived_at = now()` : sql`archived_at = NULL`);
    }

    const result = await this.database.execute<ConversationRow>(sql`
      UPDATE conversations
      SET ${sql.join(setClauses, sql`, `)}
      WHERE id = ${conversationId}
        AND workspace_id = ${workspaceId}
        AND owner_user_id = ${ownerUserId}
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
    `);

    return result.rows[0] ?? null;
  }

  async findConversation(
    conversationId: string,
    workspaceId: string,
    ownerUserId: string,
    executor?: DatabaseExecutor
  ): Promise<ConversationRow | null> {
    const result = await this.resolveExecutor(executor).execute<ConversationRow>(sql`
      SELECT
        archived_at,
        id,
        is_pinned,
        mode,
        owner_user_id,
        pinned_message_ids,
        title,
        updated_at,
        workspace_id
      FROM conversations
      WHERE id = ${conversationId}
        AND workspace_id = ${workspaceId}
        AND owner_user_id = ${ownerUserId}
    `);

    return result.rows[0] ?? null;
  }

  async updateConversationMode(
    conversationId: string,
    workspaceId: string,
    ownerUserId: string,
    mode: Conversation["mode"],
    executor?: DatabaseExecutor
  ): Promise<ConversationRow | null> {
    const result = await this.resolveExecutor(executor).execute<ConversationRow>(sql`
      UPDATE conversations
      SET mode = ${mode}, updated_at = now()
      WHERE id = ${conversationId}
        AND workspace_id = ${workspaceId}
        AND owner_user_id = ${ownerUserId}
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
    `);

    return result.rows[0] ?? null;
  }

  async listConversationParticipants(
    conversationId: string,
    workspaceId: string,
    executor?: DatabaseExecutor
  ): Promise<ConversationAgentRow[]> {
    const result = await this.resolveExecutor(executor).execute<ConversationAgentRow>(sql`
      SELECT conversation_id, agent_id, agent_name
      FROM conversation_agents
      WHERE conversation_id = ${conversationId}
        AND workspace_id = ${workspaceId}
      ORDER BY agent_id ASC
    `);

    return result.rows;
  }

  async findOwnedConversation(
    conversationId: string,
    actorUserId: string
  ): Promise<OwnedConversationRow | null> {
    const result = await this.database.execute<OwnedConversationRow>(sql`
      SELECT owner_user_id, workspace_id
      FROM conversations
      WHERE id = ${conversationId}
        AND owner_user_id = ${actorUserId}
    `);

    return result.rows[0] ?? null;
  }

  async conversationExists(
    conversationId: string,
    workspaceId: string,
    ownerUserId: string
  ): Promise<boolean> {
    const result = await this.database.execute<{ id: string }>(sql`
      SELECT id
      FROM conversations
      WHERE id = ${conversationId}
        AND workspace_id = ${workspaceId}
        AND owner_user_id = ${ownerUserId}
    `);

    return Boolean(result.rows[0]);
  }

  async listConversationMembers(
    conversationId: string,
    workspaceId: string,
    ownerUserId: string
  ): Promise<ConversationMemberRow[]> {
    const result = await this.database.execute<ConversationMemberRow>(sql`
      SELECT
        conversations.mode,
        conversation_agents.agent_id,
        conversation_agents.agent_name
      FROM conversations
      LEFT JOIN conversation_agents
        ON conversation_agents.conversation_id = conversations.id
        AND conversation_agents.workspace_id = conversations.workspace_id
      WHERE conversations.id = ${conversationId}
        AND conversations.workspace_id = ${workspaceId}
        AND conversations.owner_user_id = ${ownerUserId}
      ORDER BY conversation_agents.agent_id ASC
    `);

    return result.rows;
  }

  async upsertShare(input: {
    actorUserId: string;
    conversationId: string;
    permission: ConversationSharePermission;
    sharedWithUserId: string;
    workspaceId: string;
    workspaceOwnerUserId: string;
  }): Promise<ConversationShareRow> {
    const result = await this.database.execute<ConversationShareRow>(sql`
      INSERT INTO conversation_shares (
        conversation_id,
        workspace_id,
        workspace_owner_user_id,
        shared_with_user_id,
        permission,
        created_by_user_id
      )
      VALUES (
        ${input.conversationId},
        ${input.workspaceId},
        ${input.workspaceOwnerUserId},
        ${input.sharedWithUserId},
        ${input.permission},
        ${input.actorUserId}
      )
      ON CONFLICT (conversation_id, shared_with_user_id) DO UPDATE
        SET permission = EXCLUDED.permission
      RETURNING
        conversation_id,
        created_at,
        created_by_user_id,
        permission,
        shared_with_user_id,
        workspace_id,
        workspace_owner_user_id
    `);

    return requireRow(result.rows[0], "Conversation share row not found after upsert.");
  }

  async listShares(conversationId: string): Promise<ConversationShareRow[]> {
    const result = await this.database.execute<ConversationShareRow>(sql`
      SELECT
        conversation_id,
        created_at,
        created_by_user_id,
        permission,
        shared_with_user_id,
        workspace_id,
        workspace_owner_user_id
      FROM conversation_shares
      WHERE conversation_id = ${conversationId}
      ORDER BY created_at ASC
    `);

    return result.rows;
  }

  async revokeShare(
    conversationId: string,
    sharedWithUserId: string
  ): Promise<number> {
    const result = await this.database.execute(sql`
      DELETE FROM conversation_shares
      WHERE conversation_id = ${conversationId}
        AND shared_with_user_id = ${sharedWithUserId}
    `);

    return result.rowCount ?? 0;
  }

  async listSharedWith(
    actorUserId: string,
    workspaceOwnerUserId: string,
    workspaceId: string
  ): Promise<
    Array<{
      conversation_id: string;
      permission: ConversationSharePermission;
      workspace_id: string;
      workspace_owner_user_id: string;
    }>
  > {
    const result = await this.database.execute<{
      conversation_id: string;
      permission: ConversationSharePermission;
      workspace_id: string;
      workspace_owner_user_id: string;
    }>(sql`
      SELECT
        conversation_id,
        permission,
        workspace_id,
        workspace_owner_user_id
      FROM conversation_shares
      WHERE shared_with_user_id = ${actorUserId}
        AND workspace_owner_user_id = ${workspaceOwnerUserId}
        AND workspace_id = ${workspaceId}
      ORDER BY created_at DESC
    `);

    return result.rows;
  }

  async listConversationAgentsWithProviders(
    conversationId: string,
    workspaceId: string,
    ownerUserId: string
  ): Promise<ResolvedConversationAgentRow[]> {
    const result = await this.database.execute<ResolvedConversationAgentRow>(sql`
      SELECT
        conversation_agents.agent_id,
        conversation_agents.agent_name,
        conversations.mode,
        custom_agents.output_style,
        custom_agents.provider,
        custom_agents.scope_description,
        custom_agents.system_prompt
      FROM conversations
      INNER JOIN conversation_agents
        ON conversation_agents.conversation_id = conversations.id
        AND conversation_agents.workspace_id = conversations.workspace_id
      INNER JOIN custom_agents
        ON custom_agents.id = conversation_agents.agent_id
        AND custom_agents.workspace_id = conversation_agents.workspace_id
      WHERE conversations.id = ${conversationId}
        AND conversations.workspace_id = ${workspaceId}
        AND conversations.owner_user_id = ${ownerUserId}
      ORDER BY conversation_agents.agent_id ASC
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
