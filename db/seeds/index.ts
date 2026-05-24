import { Client } from "pg";

import { buildSeedAgents } from "./agents.js";
import { buildSeedConversations } from "./conversations.js";

async function seed(): Promise<void> {
  const client = new Client({
    connectionString:
      process.env.DATABASE_URL ?? "postgres://agenthub:agenthub@localhost:5432/agenthub"
  });

  const ownerUserId = "user_seed_1";
  const workspaceId = "default-workspace";
  const agents = buildSeedAgents(workspaceId, ownerUserId);
  const { conversations, messages } = buildSeedConversations(workspaceId, ownerUserId);

  await client.connect();

  try {
    await client.query(
      `
        INSERT INTO users (id, email, display_name)
        VALUES ($1, $2, $3)
        ON CONFLICT (id) DO NOTHING
      `,
      [ownerUserId, "seed.user@example.com", "Seed User"]
    );

    await client.query(
      `
        INSERT INTO workspaces (id, owner_user_id, name)
        VALUES ($1, $2, $3)
        ON CONFLICT (owner_user_id, id) DO NOTHING
      `,
      [workspaceId, ownerUserId, "Default Workspace"]
    );

    await client.query(
      `
        INSERT INTO workspace_members (
          workspace_id,
          workspace_owner_user_id,
          user_id,
          role
        )
        VALUES ($1, $2, $2, 'owner')
        ON CONFLICT (workspace_owner_user_id, workspace_id, user_id) DO NOTHING
      `,
      [workspaceId, ownerUserId]
    );

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
          INSERT INTO messages (
            id,
            conversation_id,
            role,
            content,
            mentioned_agent_ids,
            owner_user_id,
            source_agent_id,
            is_pinned,
            workspace_id
          )
          VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9)
          ON CONFLICT (id) DO NOTHING
        `,
        [
          message.id,
          message.conversationId,
          message.role,
          message.content,
          JSON.stringify(message.mentionedAgentIds),
          message.ownerUserId,
          message.sourceAgentId,
          message.isPinned,
          message.workspaceId
        ]
      );
    }

    for (const agent of agents) {
      await client.query(
        `
          INSERT INTO custom_agents (
            id,
            avatar_url,
            capability_tags,
            name,
            owner_user_id,
            provider,
            system_prompt,
            tool_bindings,
            workspace_id
          )
          VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7, $8::jsonb, $9)
          ON CONFLICT DO NOTHING
        `,
        [
          agent.id,
          agent.avatarUrl,
          JSON.stringify(agent.capabilityTags),
          agent.name,
          agent.ownerUserId,
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
