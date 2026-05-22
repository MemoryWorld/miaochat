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

import { DatabaseService } from "../database/database.service.js";

type ConversationMemberRow = {
  agent_id: string | null;
  agent_name: string | null;
  mode: Conversation["mode"];
};

@Injectable()
export class GroupMembersService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

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
    const result = await this.database.query<ConversationMemberRow>(
      `
        SELECT
          conversations.mode,
          conversation_agents.agent_id,
          conversation_agents.agent_name
        FROM conversations
        LEFT JOIN conversation_agents
          ON conversation_agents.conversation_id = conversations.id
          AND conversation_agents.workspace_id = conversations.workspace_id
        WHERE conversations.id = $1
          AND conversations.workspace_id = $2
          AND conversations.owner_user_id = $3
        ORDER BY conversation_agents.agent_id ASC
      `,
      [parsedConversationId, parsedWorkspaceId, ownerUserId]
    );

    if (result.rows.length === 0) {
      throw new NotFoundException(
        `Conversation ${parsedConversationId} was not found in workspace ${parsedWorkspaceId}`
      );
    }

    const firstRow = result.rows[0];

    if (!firstRow) {
      throw new NotFoundException(
        `Conversation ${parsedConversationId} was not found in workspace ${parsedWorkspaceId}`
      );
    }

    return {
      members: result.rows
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
