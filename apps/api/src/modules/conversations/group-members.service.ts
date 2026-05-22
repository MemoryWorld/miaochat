import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException
} from "@nestjs/common";

import {
  conversationIdSchema,
  workspaceIdSchema,
  type Conversation,
  type ConversationAgentMember
} from "@agenthub/contracts";

import {
  ConversationsRepository,
  type ConversationMemberRow
} from "./conversations.repository.js";

@Injectable()
export class GroupMembersService {
  constructor(
    @Inject(ConversationsRepository)
    private readonly conversationsRepository: ConversationsRepository
  ) {}

  async listMembers(
    conversationId: string,
    workspaceId: string,
    ownerUserId: string
  ): Promise<ConversationAgentMember[]> {
    const conversation = await this.loadConversationMembers(
      conversationId,
      workspaceId,
      ownerUserId
    );

    return conversation.members;
  }

  async resolveMentionedAgentIds(input: {
    conversationId: string;
    mentionedAgentIds: string[];
    ownerUserId: string;
    workspaceId: string;
  }): Promise<string[]> {
    if (input.mentionedAgentIds.length === 0) {
      return [];
    }

    const conversation = await this.loadConversationMembers(
      input.conversationId,
      input.workspaceId,
      input.ownerUserId
    );

    if (conversation.mode !== "group") {
      throw new BadRequestException(
        "Explicit agent targeting is only supported in group conversations."
      );
    }

    const memberIds = new Set(conversation.members.map((member) => member.agentId));
    const mentionedAgentIds = [...new Set(input.mentionedAgentIds)];
    const invalidMentionIds = mentionedAgentIds.filter((agentId) => !memberIds.has(agentId));

    if (invalidMentionIds.length > 0) {
      throw new BadRequestException("Mentioned agents must belong to the conversation.");
    }

    return mentionedAgentIds;
  }

  private async loadConversationMembers(
    conversationId: string,
    workspaceId: string,
    ownerUserId: string
  ): Promise<{
    members: ConversationAgentMember[];
    mode: Conversation["mode"];
  }> {
    const parsedConversationId = conversationIdSchema.parse(conversationId);
    const parsedWorkspaceId = workspaceIdSchema.parse(workspaceId);
    const result = await this.conversationsRepository.listConversationMembers(
      parsedConversationId,
      parsedWorkspaceId,
      ownerUserId
    );

    if (result.length === 0) {
      throw new NotFoundException(
        `Conversation ${parsedConversationId} was not found in workspace ${parsedWorkspaceId}`
      );
    }

    const firstRow = result[0];

    if (!firstRow) {
      throw new NotFoundException(
        `Conversation ${parsedConversationId} was not found in workspace ${parsedWorkspaceId}`
      );
    }

    return {
      members: result
        .filter(
          (row): row is ConversationMemberRow & { agent_id: string; agent_name: string } =>
            typeof row.agent_id === "string" && typeof row.agent_name === "string"
        )
        .map((row) => ({
          agentId: row.agent_id,
          agentName: row.agent_name
        })),
      mode: firstRow.mode
    };
  }
}
