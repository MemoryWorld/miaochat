import { Client } from "pg";

import { buildSeedAgents } from "./agents.js";
import { buildSeedConversations } from "./conversations.js";

async function seed(): Promise<void> {
  const client = new Client({
    connectionString:
      process.env.DATABASE_URL ?? "postgres://agenthub:agenthub@localhost:5432/agenthub"
  });

  const agents = buildSeedAgents();
  const { conversations, messages } = buildSeedConversations();

  await client.connect();

  try {
    for (const conversation of conversations) {
      await client.query(
        `
          INSERT INTO conversations (id, mode, owner_user_id, pinned_message_ids, title, workspace_id)
          VALUES ($1, $2, $3, $4::jsonb, $5, $6)
          ON CONFLICT (id) DO NOTHING
        `,
        [
          conversation.id,
          conversation.mode,
          conversation.ownerUserId,
          JSON.stringify(conversation.pinnedMessageIds),
          conversation.title,
          conversation.workspaceId
        ]
      );

      await client.query(
        `
          DELETE FROM conversation_agents
          WHERE conversation_id = $1
        `,
        [conversation.id]
      );

      for (const participant of conversation.participants) {
        await client.query(
          `
            INSERT INTO conversation_agents (conversation_id, agent_id, agent_name, workspace_id)
            VALUES ($1, $2, $3, $4)
          `,
          [
            conversation.id,
            participant.agentId,
            participant.agentName,
            conversation.workspaceId
          ]
        );
      }
    }

    for (const message of messages) {
      await client.query(
        `
          INSERT INTO messages (id, conversation_id, role, content, source_agent_id, is_pinned, workspace_id)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT (id) DO NOTHING
        `,
        [
          message.id,
          message.conversationId,
          message.role,
          message.content,
          message.sourceAgentId,
          message.isPinned,
          message.workspaceId
        ]
      );
    }

    for (const agent of agents) {
      await client.query(
        `
          INSERT INTO custom_agents (id, avatar_url, capability_tags, name, provider, system_prompt, tool_bindings, workspace_id)
          VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7::jsonb, $8)
          ON CONFLICT (id) DO NOTHING
        `,
        [
          agent.id,
          agent.avatarUrl,
          JSON.stringify(agent.capabilityTags),
          agent.name,
          agent.provider,
          agent.systemPrompt,
          JSON.stringify(agent.toolBindings),
          agent.workspaceId
        ]
      );
    }
  } finally {
    await client.end();
  }
}

seed().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
