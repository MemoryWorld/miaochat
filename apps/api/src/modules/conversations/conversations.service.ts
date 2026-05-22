import { randomUUID } from "node:crypto";

import { Inject, Injectable } from "@nestjs/common";

import {
  conversationSchema,
  createConversationInputSchema,
  workspaceIdSchema,
  type Conversation,
  type ConversationAgentMember
} from "@agenthub/contracts";

import { DatabaseService } from "../database/database.service.js";
import {
  ConversationsRepository,
  type ConversationRow
} from "./conversations.repository.js";

@Injectable()
export class ConversationsService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(ConversationsRepository)
    private readonly conversationsRepository: ConversationsRepository
  ) {}

  async create(input: unknown, ownerUserId: string): Promise<Conversation> {
    const parsed = createConversationInputSchema.parse(input);
    const workspaceId = workspaceIdSchema.parse(parsed.workspaceId);

    return this.database.transaction(async (tx) => {
      const participants = await this.conversationsRepository.resolveParticipants(
        ownerUserId,
        workspaceId,
        parsed.agentIds,
        tx
      );
      const conversationId = randomUUID();
      const title = parsed.title?.trim() || buildConversationTitle(parsed.mode, participants);

      const inserted = await this.conversationsRepository.createConversation(
        {
          id: conversationId,
          mode: parsed.mode,
          ownerUserId,
          title,
          workspaceId
        },
        tx
      );

      await this.conversationsRepository.insertConversationAgents(
        conversationId,
        workspaceId,
        participants,
        tx
      );

      return mapConversationRow(inserted, participants);
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

    const conversations = await this.conversationsRepository.listConversations(
      parsedWorkspaceId,
      ownerUserId,
      {
        includeArchived,
        search
      }
    );

    if (conversations.length === 0) {
      return [];
    }

    const participants = await this.conversationsRepository.listWorkspaceParticipants(
      parsedWorkspaceId,
      ownerUserId
    );

    const participantMap = new Map<string, ConversationAgentMember[]>();
    for (const row of participants) {
      const current = participantMap.get(row.conversation_id) ?? [];
      current.push({
        agentId: row.agent_id,
        agentName: row.agent_name
      });
      participantMap.set(row.conversation_id, current);
    }

    return conversations.map((row) =>
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

    const result = await this.conversationsRepository.updateConversation(
      conversationId,
      parsedWorkspaceId,
      ownerUserId,
      change
    );

    if (!result) {
      throw new Error(
        `Conversation ${conversationId} was not found in workspace ${workspaceId}.`
      );
    }

    const participants = await this.conversationsRepository.listConversationParticipants(
      conversationId,
      parsedWorkspaceId
    );

    return mapConversationRow(
      result,
      participants.map((row) => ({
        agentId: row.agent_id,
        agentName: row.agent_name
      }))
    );
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
