import { randomUUID } from "node:crypto";

import { Inject, Injectable, NotFoundException } from "@nestjs/common";

import {
  conversationSchema,
  createConversationInputSchema,
  createChannelTeammateInputSchema,
  workspaceIdSchema,
  type CustomAgent,
  type Conversation,
  type ConversationAgentMember
} from "@agenthub/contracts";

import { DatabaseService } from "../database/database.service.js";
import {
  ConversationsRepository,
  type ConversationRow
} from "./conversations.repository.js";
import { CustomAgentsService } from "../custom-agents/custom-agents.service.js";

@Injectable()
export class ConversationsService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CustomAgentsService)
    private readonly customAgentsService: CustomAgentsService,
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
      await this.conversationsRepository.insertOwnerChannelMembership(
        {
          conversationId,
          ownerUserId,
          workspaceId
        },
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

    await this.conversationsRepository.deleteExpiredArchivedConversations(
      parsedWorkspaceId,
      ownerUserId
    );

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

  async addTeammate(
    conversationId: string,
    input: unknown,
    ownerUserId: string
  ): Promise<{ agent: CustomAgent; conversation: Conversation }> {
    const parsed = createChannelTeammateInputSchema.parse(input);
    const workspaceId = workspaceIdSchema.parse(parsed.workspaceId ?? "default-workspace");

    return this.database.transaction(async (tx) => {
      const conversation = await this.conversationsRepository.findConversation(
        conversationId,
        workspaceId,
        ownerUserId,
        tx
      );

      if (!conversation) {
        throw new NotFoundException(`Conversation ${conversationId} was not found.`);
      }

      const workspaceAgentNames = await this.conversationsRepository.listWorkspaceAgentNames(
        workspaceId,
        ownerUserId,
        tx
      );
      const currentParticipants =
        await this.conversationsRepository.listConversationParticipants(
          conversationId,
          workspaceId,
          tx
        );
      const agentName = resolveAvailableTeammateName(parsed.teammate.name, [
        ...workspaceAgentNames,
        ...currentParticipants.map((participant) => participant.agent_name)
      ]);

      const agent = await this.customAgentsService.create(
        {
          ...parsed.teammate,
          name: agentName,
          workspaceId
        },
        ownerUserId,
        tx
      );

      await this.conversationsRepository.insertConversationAgents(
        conversationId,
        workspaceId,
        [
          {
            agentId: agent.id,
            agentName: agent.name
          }
        ],
        tx
      );

      const participants = await this.conversationsRepository.listConversationParticipants(
        conversationId,
        workspaceId,
        tx
      );
      const participantMembers = participants.map((row) => ({
        agentId: row.agent_id,
        agentName: row.agent_name
      }));
      const nextMode: Conversation["mode"] =
        participantMembers.length > 1 ? "group" : "direct";
      const updatedConversation =
        conversation.mode === nextMode
          ? conversation
          : await this.conversationsRepository.updateConversationMode(
              conversationId,
              workspaceId,
              ownerUserId,
              nextMode,
              tx
            );

      return {
        agent,
        conversation: mapConversationRow(updatedConversation ?? conversation, participantMembers)
      };
    });
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
    const parsedWorkspaceId = workspaceIdSchema.parse(workspaceId);
    await this.conversationsRepository.deleteExpiredArchivedConversations(
      parsedWorkspaceId,
      ownerUserId
    );

    return this.applyMutation(workspaceId, ownerUserId, conversationId, {
      archived: false
    });
  }

  async delete(
    workspaceId: string,
    ownerUserId: string,
    conversationId: string
  ): Promise<{ conversationId: string; deleted: true }> {
    const parsedWorkspaceId = workspaceIdSchema.parse(workspaceId);
    const deleted = await this.conversationsRepository.deleteConversation(
      conversationId,
      parsedWorkspaceId,
      ownerUserId
    );

    if (!deleted) {
      throw new NotFoundException(
        `Conversation ${conversationId} was not found in workspace ${workspaceId}.`
      );
    }

    return {
      conversationId,
      deleted: true
    };
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
      throw new NotFoundException(
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
    return `${participants[0].agentName}频道`;
  }

  if (participants.length === 0) {
    return "新频道";
  }

  const participantNames = participants.slice(0, 2).map((entry) => entry.agentName);
  return `${participantNames.join(" + ")}协作频道`;
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

function resolveAvailableTeammateName(
  requestedName: string,
  occupiedNames: string[]
): string {
  const maxNameLength = 80;
  const baseName = requestedName.trim();
  const occupiedNameSet = new Set(
    occupiedNames.map((name) => name.trim()).filter((name) => name.length > 0)
  );

  if (!occupiedNameSet.has(baseName)) {
    return baseName;
  }

  for (let suffix = 1; suffix <= 999; suffix += 1) {
    const suffixText = String(suffix);
    const candidate = `${baseName.slice(0, maxNameLength - suffixText.length)}${suffixText}`;

    if (!occupiedNameSet.has(candidate)) {
      return candidate;
    }
  }

  const fallbackSuffix = String(Date.now());
  return `${baseName.slice(0, maxNameLength - fallbackSuffix.length)}${fallbackSuffix}`;
}
