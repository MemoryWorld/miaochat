import type { Conversation, Message } from "@agenthub/contracts";

export function buildSeedConversations(
  workspaceId = "default-workspace",
  ownerUserId = "user_seed_1"
): {
  conversations: Conversation[];
  messages: Message[];
} {
  return {
    conversations: [
      {
        id: "conv_seed_1",
        mode: "group",
        ownerUserId,
        participants: [
          { agentId: "agent_hermes", agentName: "Hermes Planner" },
          { agentId: "agent_codex", agentName: "Codex Builder" }
        ],
        pinnedMessageIds: [],
        title: "Seed planning conversation",
        updatedAt: new Date(),
        workspaceId
      }
    ],
    messages: [
      {
        content: "Plan the release foundation work.",
        conversationId: "conv_seed_1",
        createdAt: new Date(),
        id: "msg_seed_1",
        isPinned: true,
        mentionedAgentIds: [],
        ownerUserId,
        role: "user",
        sourceAgentId: null,
        workspaceId
      }
    ]
  };
}
