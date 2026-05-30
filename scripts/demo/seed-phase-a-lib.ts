import { randomBytes, scrypt as scryptCallback } from "node:crypto";
import { promisify } from "node:util";

import type { Client } from "pg";

import { encryptCredentialSecret } from "../../packages/domain/src/credentials/credential-encryption.js";

import type { PhaseADemoEnvironment, PhaseADemoProvider } from "./phase-a-support.js";

const scrypt = promisify(scryptCallback);

type DemoAgentDraft = {
  capabilityTags: string[];
  id: string;
  name: string;
  provider: "hermes" | "openclaw";
  systemPrompt: string;
  toolBindings: [];
};

type DemoArtifactDraft = {
  id: string;
  kind: "attachment" | "diff" | "preview";
  messageId: string;
  mimeType: string;
  previewUrl: string | null;
  storageKey: string | null;
  title: string;
};

type DemoConversationDraft = {
  id: string;
  isPinned: boolean;
  mode: "direct" | "group";
  participantIds: string[];
  pinnedMessageIds: string[];
  title: string;
};

type DemoCredentialDraft = {
  encryptedSecret: string;
  id: string;
  label: string;
  provider: PhaseADemoProvider;
  providerAccountId: string;
};

type DemoMessageDraft = {
  content: string;
  conversationId: string;
  id: string;
  isPinned: boolean;
  mentionedAgentIds: string[];
  role: "assistant" | "user";
  sourceAgentId: string | null;
};

type DemoUserDraft = {
  displayName: string;
  email: string;
  id: string;
  passwordHash: string;
};

type DemoWorkspaceDraft = {
  id: string;
  name: string;
  ownerUserId: string;
};

export type PhaseADemoSeedCredentialStatus = {
  id: string;
  label: string;
  provider: PhaseADemoProvider;
  status: "bound" | "manual_setup_required";
};

export type PhaseADemoSeedResult = {
  conversations: Array<{
    id: string;
    mode: "direct" | "group";
    title: string;
  }>;
  credentials: PhaseADemoSeedCredentialStatus[];
  customAgents: Array<{
    id: string;
    name: string;
    provider: "hermes" | "openclaw";
  }>;
  nextAction: string;
  summary: {
    counts: {
      artifactCount: number;
      conversationCount: number;
      credentialCount: number;
      messageCount: number;
    };
  };
  user: {
    email: string;
    id: string;
    password: string;
  };
  workspace: {
    id: string;
    name: string;
  };
};

export type PhaseADemoStore = {
  clearWorkspaceProviderMode(
    workspaceId: string,
    ownerUserId: string,
    provider: PhaseADemoProvider
  ): Promise<void>;
  replaceConversationParticipants(
    conversationId: string,
    workspaceId: string,
    ownerUserId: string,
    participants: DemoAgentDraft[]
  ): Promise<void>;
  upsertArtifact(
    workspaceId: string,
    ownerUserId: string,
    artifact: DemoArtifactDraft
  ): Promise<void>;
  upsertCredential(
    workspaceId: string,
    ownerUserId: string,
    credential: DemoCredentialDraft
  ): Promise<void>;
  upsertCustomAgent(
    workspaceId: string,
    ownerUserId: string,
    agent: DemoAgentDraft
  ): Promise<void>;
  upsertMessage(
    workspaceId: string,
    ownerUserId: string,
    message: DemoMessageDraft
  ): Promise<void>;
  upsertUser(user: DemoUserDraft): Promise<void>;
  upsertWorkspace(workspace: DemoWorkspaceDraft): Promise<void>;
  upsertWorkspaceMembership(
    workspaceId: string,
    ownerUserId: string,
    userId: string,
    role: "owner"
  ): Promise<void>;
  upsertConversation(
    workspaceId: string,
    ownerUserId: string,
    conversation: DemoConversationDraft
  ): Promise<void>;
};

export type InMemoryPhaseADemoStore = PhaseADemoStore & {
  snapshot(): {
    artifactCount: number;
    conversationCount: number;
    credentialCount: number;
    messageCount: number;
    userCount: number;
    workspaceCount: number;
  };
};

const demoUserId = "user_phase_a_demo";
const demoWorkspaceId = "default-workspace";

export async function seedPhaseADemoData(
  store: PhaseADemoStore,
  environment: PhaseADemoEnvironment
): Promise<PhaseADemoSeedResult> {
  const fixtures = await buildPhaseADemoFixtures(environment);

  await store.upsertUser(fixtures.user);
  await store.upsertWorkspace(fixtures.workspace);
  await store.upsertWorkspaceMembership(
    fixtures.workspace.id,
    fixtures.workspace.ownerUserId,
    fixtures.user.id,
    "owner"
  );

  for (const agent of fixtures.customAgents) {
    await store.upsertCustomAgent(fixtures.workspace.id, fixtures.user.id, agent);
  }

  for (const conversation of fixtures.conversations) {
    await store.upsertConversation(fixtures.workspace.id, fixtures.user.id, conversation);
    await store.replaceConversationParticipants(
      conversation.id,
      fixtures.workspace.id,
      fixtures.user.id,
      fixtures.customAgents.filter((agent) => conversation.participantIds.includes(agent.id))
    );
  }

  for (const message of fixtures.messages) {
    await store.upsertMessage(fixtures.workspace.id, fixtures.user.id, message);
  }

  for (const artifact of fixtures.artifacts) {
    await store.upsertArtifact(fixtures.workspace.id, fixtures.user.id, artifact);
  }

  for (const provider of environment.providers) {
    await store.clearWorkspaceProviderMode(
      fixtures.workspace.id,
      fixtures.user.id,
      provider.provider
    );
  }

  const credentialStatuses: PhaseADemoSeedCredentialStatus[] = [];
  for (const credential of fixtures.credentials) {
    if (credential) {
      await store.upsertCredential(fixtures.workspace.id, fixtures.user.id, credential);
      credentialStatuses.push({
        id: credential.id,
        label: credential.label,
        provider: credential.provider,
        status: "bound"
      });
      continue;
    }

    const provider = environment.providers[credentialStatuses.length];
    if (!provider) {
      continue;
    }

    credentialStatuses.push({
      id: `${provider.provider}_manual_setup`,
      label: `${provider.provider} manual setup required`,
      provider: provider.provider,
      status: "manual_setup_required"
    });
  }

  return {
    conversations: fixtures.conversations.map((conversation) => ({
      id: conversation.id,
      mode: conversation.mode,
      title: conversation.title
    })),
    credentials: credentialStatuses,
    customAgents: fixtures.customAgents.map((agent) => ({
      id: agent.id,
      name: agent.name,
      provider: agent.provider
    })),
    nextAction: credentialStatuses.some((entry) => entry.status === "manual_setup_required")
      ? "Log in as the demo user, open /setup, bind the missing Phase A providers, then record the demo."
      : "Start the API and web apps, log in as the demo user, and open the seeded Phase A conversations.",
    summary: {
      counts: {
        artifactCount: fixtures.artifacts.length,
        conversationCount: fixtures.conversations.length,
        credentialCount: fixtures.credentials.filter(Boolean).length,
        messageCount: fixtures.messages.length
      }
    },
    user: {
      email: fixtures.user.email,
      id: fixtures.user.id,
      password: environment.demoPassword
    },
    workspace: {
      id: fixtures.workspace.id,
      name: fixtures.workspace.name
    }
  };
}

export function formatPhaseADemoSeedReport(result: PhaseADemoSeedResult): string {
  const lines = [
    "# Phase A Demo Seed",
    "",
    `Demo user: ${result.user.email}`,
    `Workspace: ${result.workspace.name} (${result.workspace.id})`,
    "",
    "Seeded conversations:"
  ];

  for (const conversation of result.conversations) {
    lines.push(`- ${conversation.title} [${conversation.mode}]`);
  }

  lines.push("", "Credential binding:");
  for (const credential of result.credentials) {
    lines.push(`- ${credential.provider}: ${credential.status}`);
  }

  lines.push("", `Next action: ${result.nextAction}`);

  return lines.join("\n");
}

export function createInMemoryPhaseADemoStore(): InMemoryPhaseADemoStore {
  const users = new Map<string, DemoUserDraft>();
  const workspaces = new Map<string, DemoWorkspaceDraft>();
  const memberships = new Map<string, { role: "owner" }>();
  const conversations = new Map<string, DemoConversationDraft>();
  const customAgents = new Map<string, DemoAgentDraft>();
  const conversationParticipants = new Map<string, string[]>();
  const messages = new Map<string, DemoMessageDraft>();
  const artifacts = new Map<string, DemoArtifactDraft>();
  const credentials = new Map<string, DemoCredentialDraft>();
  const credentialModes = new Set<string>();

  return {
    async clearWorkspaceProviderMode(workspaceId, ownerUserId, provider) {
      credentialModes.delete(`${ownerUserId}:${workspaceId}:${provider}`);
    },
    async replaceConversationParticipants(conversationId, _workspaceId, _ownerUserId, participants) {
      conversationParticipants.set(
        conversationId,
        participants.map((participant) => participant.id)
      );
    },
    snapshot() {
      return {
        artifactCount: artifacts.size,
        conversationCount: conversations.size,
        credentialCount: credentials.size,
        messageCount: messages.size,
        userCount: users.size,
        workspaceCount: workspaces.size
      };
    },
    async upsertArtifact(_workspaceId, _ownerUserId, artifact) {
      artifacts.set(artifact.id, artifact);
    },
    async upsertCredential(_workspaceId, _ownerUserId, credential) {
      credentials.set(credential.id, credential);
    },
    async upsertConversation(_workspaceId, _ownerUserId, conversation) {
      conversations.set(conversation.id, conversation);
    },
    async upsertCustomAgent(_workspaceId, _ownerUserId, agent) {
      customAgents.set(agent.id, agent);
    },
    async upsertMessage(_workspaceId, _ownerUserId, message) {
      messages.set(message.id, message);
    },
    async upsertUser(user) {
      users.set(user.id, user);
    },
    async upsertWorkspace(workspace) {
      workspaces.set(workspace.id, workspace);
    },
    async upsertWorkspaceMembership(workspaceId, ownerUserId, userId, role) {
      memberships.set(`${ownerUserId}:${workspaceId}:${userId}`, { role });
    }
  };
}

export function createPgPhaseADemoStore(client: Client): PhaseADemoStore {
  return {
    async clearWorkspaceProviderMode(workspaceId, ownerUserId, provider) {
      const existence = await client.query<{ regclass: string | null }>(
        `SELECT to_regclass('workspace_provider_credential_modes') AS regclass`
      );

      if (!existence.rows[0]?.regclass) {
        return;
      }

      await client.query(
        `
          DELETE FROM workspace_provider_credential_modes
          WHERE owner_user_id = $1
            AND workspace_id = $2
            AND provider = $3
        `,
        [ownerUserId, workspaceId, provider]
      );
    },
    async replaceConversationParticipants(conversationId, workspaceId, _ownerUserId, participants) {
      await client.query(
        `
          DELETE FROM conversation_agents
          WHERE conversation_id = $1
            AND workspace_id = $2
        `,
        [conversationId, workspaceId]
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
          [conversationId, participant.id, participant.name, workspaceId]
        );
      }
    },
    async upsertArtifact(workspaceId, _ownerUserId, artifact) {
      await client.query(
        `
          INSERT INTO artifacts (
            id,
            kind,
            message_id,
            mime_type,
            preview_url,
            storage_key,
            title,
            workspace_id
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          ON CONFLICT (id) DO UPDATE SET
            kind = EXCLUDED.kind,
            message_id = EXCLUDED.message_id,
            mime_type = EXCLUDED.mime_type,
            preview_url = EXCLUDED.preview_url,
            storage_key = EXCLUDED.storage_key,
            title = EXCLUDED.title,
            workspace_id = EXCLUDED.workspace_id,
            updated_at = now()
        `,
        [
          artifact.id,
          artifact.kind,
          artifact.messageId,
          artifact.mimeType,
          artifact.previewUrl,
          artifact.storageKey,
          artifact.title,
          workspaceId
        ]
      );
    },
    async upsertCredential(workspaceId, ownerUserId, credential) {
      await client.query(
        `
          INSERT INTO provider_credentials (
            id,
            credential_source,
            encrypted_secret,
            label,
            owner_user_id,
            provider,
            provider_account_id,
            validation_state,
            workspace_id
          )
          VALUES ($1, 'user_provided', $2, $3, $4, $5, $6, 'valid', $7)
          ON CONFLICT (id) DO UPDATE SET
            credential_source = EXCLUDED.credential_source,
            encrypted_secret = EXCLUDED.encrypted_secret,
            label = EXCLUDED.label,
            owner_user_id = EXCLUDED.owner_user_id,
            provider = EXCLUDED.provider,
            provider_account_id = EXCLUDED.provider_account_id,
            validation_state = EXCLUDED.validation_state,
            workspace_id = EXCLUDED.workspace_id,
            updated_at = now()
        `,
        [
          credential.id,
          credential.encryptedSecret,
          credential.label,
          ownerUserId,
          credential.provider,
          credential.providerAccountId,
          workspaceId
        ]
      );
    },
    async upsertConversation(workspaceId, ownerUserId, conversation) {
      await client.query(
        `
          INSERT INTO conversations (
            id,
            mode,
            owner_user_id,
            pinned_message_ids,
            title,
            workspace_id,
            is_pinned,
            archived_at
          )
          VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, NULL)
          ON CONFLICT (id) DO UPDATE SET
            mode = EXCLUDED.mode,
            owner_user_id = EXCLUDED.owner_user_id,
            pinned_message_ids = EXCLUDED.pinned_message_ids,
            title = EXCLUDED.title,
            workspace_id = EXCLUDED.workspace_id,
            is_pinned = EXCLUDED.is_pinned,
            archived_at = EXCLUDED.archived_at,
            updated_at = now()
        `,
        [
          conversation.id,
          conversation.mode,
          ownerUserId,
          JSON.stringify(conversation.pinnedMessageIds),
          conversation.title,
          workspaceId,
          conversation.isPinned
        ]
      );
    },
    async upsertCustomAgent(workspaceId, ownerUserId, agent) {
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
          VALUES ($1, null, $2::jsonb, $3, $4, $5, $6, '[]'::jsonb, $7)
          ON CONFLICT (workspace_id, id) DO UPDATE SET
            capability_tags = EXCLUDED.capability_tags,
            name = EXCLUDED.name,
            owner_user_id = EXCLUDED.owner_user_id,
            provider = EXCLUDED.provider,
            system_prompt = EXCLUDED.system_prompt,
            tool_bindings = EXCLUDED.tool_bindings,
            updated_at = now()
        `,
        [
          agent.id,
          JSON.stringify(agent.capabilityTags),
          agent.name,
          ownerUserId,
          agent.provider,
          agent.systemPrompt,
          workspaceId
        ]
      );
    },
    async upsertMessage(workspaceId, ownerUserId, message) {
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
          ON CONFLICT (id) DO UPDATE SET
            conversation_id = EXCLUDED.conversation_id,
            role = EXCLUDED.role,
            content = EXCLUDED.content,
            mentioned_agent_ids = EXCLUDED.mentioned_agent_ids,
            owner_user_id = EXCLUDED.owner_user_id,
            source_agent_id = EXCLUDED.source_agent_id,
            is_pinned = EXCLUDED.is_pinned,
            workspace_id = EXCLUDED.workspace_id,
            updated_at = now()
        `,
        [
          message.id,
          message.conversationId,
          message.role,
          message.content,
          JSON.stringify(message.mentionedAgentIds),
          ownerUserId,
          message.sourceAgentId,
          message.isPinned,
          workspaceId
        ]
      );
    },
    async upsertUser(user) {
      await client.query(
        `
          INSERT INTO users (id, email, display_name)
          VALUES ($1, $2, $3)
          ON CONFLICT (id) DO UPDATE SET
            email = EXCLUDED.email,
            display_name = EXCLUDED.display_name,
            updated_at = now()
        `,
        [user.id, user.email, user.displayName]
      );
      await client.query(
        `
          INSERT INTO auth_credentials (user_id, password_hash)
          VALUES ($1, $2)
          ON CONFLICT (user_id) DO UPDATE SET
            password_hash = EXCLUDED.password_hash,
            updated_at = now()
        `,
        [user.id, user.passwordHash]
      );
    },
    async upsertWorkspace(workspace) {
      await client.query(
        `
          INSERT INTO workspaces (id, owner_user_id, name)
          VALUES ($1, $2, $3)
          ON CONFLICT (owner_user_id, id) DO UPDATE SET
            name = EXCLUDED.name,
            updated_at = now()
        `,
        [workspace.id, workspace.ownerUserId, workspace.name]
      );
    },
    async upsertWorkspaceMembership(workspaceId, ownerUserId, userId, role) {
      await client.query(
        `
          INSERT INTO workspace_members (
            workspace_id,
            workspace_owner_user_id,
            user_id,
            role
          )
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (workspace_owner_user_id, workspace_id, user_id) DO UPDATE SET
            role = EXCLUDED.role,
            updated_at = now()
        `,
        [workspaceId, ownerUserId, userId, role]
      );
    }
  };
}

async function buildPhaseADemoFixtures(
  environment: PhaseADemoEnvironment
): Promise<{
  artifacts: DemoArtifactDraft[];
  conversations: DemoConversationDraft[];
  credentials: Array<DemoCredentialDraft | null>;
  customAgents: DemoAgentDraft[];
  messages: DemoMessageDraft[];
  user: DemoUserDraft;
  workspace: DemoWorkspaceDraft;
}> {
  const customAgents: DemoAgentDraft[] = [
    {
      capabilityTags: ["phase-a", "demo", "direct"],
      id: "agent_phase_a_hermes_direct",
      name: "Hermes Demo Direct",
      provider: "hermes",
      systemPrompt: "Handle direct Phase A demo prompts with concise implementation guidance.",
      toolBindings: []
    },
    {
      capabilityTags: ["phase-a", "demo", "group", "planning"],
      id: "agent_phase_a_hermes_planner",
      name: "Hermes Demo Planner",
      provider: "hermes",
      systemPrompt: "Break multi-agent demo work into clear orchestration steps.",
      toolBindings: []
    },
    {
      capabilityTags: ["phase-a", "demo", "group", "execution"],
      id: "agent_phase_a_openclaw_operator",
      name: "OpenClaw Demo Operator",
      provider: "openclaw",
      systemPrompt: "Provide execution-oriented output for the Phase A group demo.",
      toolBindings: []
    }
  ];
  const conversations: DemoConversationDraft[] = [
    {
      id: "conv_phase_a_direct",
      isPinned: false,
      mode: "direct",
      participantIds: ["agent_phase_a_hermes_direct"],
      pinnedMessageIds: ["msg_phase_a_direct_user"],
      title: "Phase A Direct Conversation"
    },
    {
      id: "conv_phase_a_group",
      isPinned: true,
      mode: "group",
      participantIds: [
        "agent_phase_a_hermes_planner",
        "agent_phase_a_openclaw_operator"
      ],
      pinnedMessageIds: [],
      title: "Phase A Group Orchestration"
    },
    {
      id: "conv_phase_a_artifact",
      isPinned: false,
      mode: "direct",
      participantIds: ["agent_phase_a_hermes_direct"],
      pinnedMessageIds: [],
      title: "Phase A Artifact Review"
    }
  ];
  const messages: DemoMessageDraft[] = [
    {
      content: "Plan the smallest runtime slice we can explain clearly in the demo.",
      conversationId: "conv_phase_a_direct",
      id: "msg_phase_a_direct_user",
      isPinned: true,
      mentionedAgentIds: [],
      role: "user",
      sourceAgentId: null
    },
    {
      content:
        "The real runtime slice is now Hermes-backed end to end, with persisted history and stream events visible after refresh.",
      conversationId: "conv_phase_a_direct",
      id: "msg_phase_a_direct_assistant",
      isPinned: false,
      mentionedAgentIds: [],
      role: "assistant",
      sourceAgentId: "agent_phase_a_hermes_direct"
    },
    {
      content: "Break the landing-page demo into planning and execution steps.",
      conversationId: "conv_phase_a_group",
      id: "msg_phase_a_group_user",
      isPinned: false,
      mentionedAgentIds: [
        "agent_phase_a_hermes_planner",
        "agent_phase_a_openclaw_operator"
      ],
      role: "user",
      sourceAgentId: null
    },
    {
      content:
        "Hermes: define the scope, confirm the provider path, and outline the demo sequence.",
      conversationId: "conv_phase_a_group",
      id: "msg_phase_a_group_assistant_hermes",
      isPinned: false,
      mentionedAgentIds: [],
      role: "assistant",
      sourceAgentId: "agent_phase_a_hermes_planner"
    },
    {
      content:
        "OpenClaw: produce the execution checklist, confirm the runtime response, and keep one artifact backup ready.",
      conversationId: "conv_phase_a_group",
      id: "msg_phase_a_group_assistant_openclaw",
      isPinned: false,
      mentionedAgentIds: [],
      role: "assistant",
      sourceAgentId: "agent_phase_a_openclaw_operator"
    },
    {
      content: "Show the preview, diff, and attachment cards in one conversation.",
      conversationId: "conv_phase_a_artifact",
      id: "msg_phase_a_artifact_user",
      isPinned: false,
      mentionedAgentIds: [],
      role: "user",
      sourceAgentId: null
    },
    {
      content:
        "The artifact backup is ready: open the preview link, inspect the diff card, or reference the attached brief if the live run stalls.",
      conversationId: "conv_phase_a_artifact",
      id: "msg_phase_a_artifact_assistant",
      isPinned: false,
      mentionedAgentIds: [],
      role: "assistant",
      sourceAgentId: "agent_phase_a_hermes_direct"
    }
  ];
  const artifacts: DemoArtifactDraft[] = [
    {
      id: "artifact_phase_a_preview",
      kind: "preview",
      messageId: "msg_phase_a_artifact_assistant",
      mimeType: "text/html",
      previewUrl: "https://example.test/phase-a-preview",
      storageKey: "artifacts/default-workspace/msg_phase_a_artifact_assistant/preview.html",
      title: "Phase A landing page preview"
    },
    {
      id: "artifact_phase_a_diff",
      kind: "diff",
      messageId: "msg_phase_a_artifact_assistant",
      mimeType: "text/x-diff",
      previewUrl: null,
      storageKey: "artifacts/default-workspace/msg_phase_a_artifact_assistant/landing.diff",
      title: "Phase A landing page diff"
    },
    {
      id: "artifact_phase_a_attachment",
      kind: "attachment",
      messageId: "msg_phase_a_artifact_assistant",
      mimeType: "text/markdown",
      previewUrl: null,
      storageKey: "artifacts/default-workspace/msg_phase_a_artifact_assistant/phase-a-brief.md",
      title: "Phase A architecture brief"
    }
  ];

  return {
    artifacts,
    conversations,
    credentials: environment.providers.map((provider) => {
      if (!provider.configured || !provider.accountId || !provider.secret) {
        return null;
      }

      return {
        encryptedSecret: encryptCredentialSecret(
          provider.secret,
          environment.credentialEncryptionKey
        ),
        id: `cred_phase_a_demo_${provider.provider}`,
        label:
          provider.provider === "hermes"
            ? "Phase A Hermes Demo"
            : "Phase A OpenClaw Demo",
        provider: provider.provider,
        providerAccountId: provider.accountId
      };
    }),
    customAgents,
    messages,
    user: {
      displayName: "Phase A Demo Operator",
      email: environment.demoEmail,
      id: demoUserId,
      // Keep the hashing identical to the API auth flow so the seeded user can
      // log in through the existing local session form.
      passwordHash: await hashSecret(environment.demoPassword)
    },
    workspace: {
      id: demoWorkspaceId,
      name: "Phase A Demo Workspace",
      ownerUserId: demoUserId
    }
  };
}

async function hashSecret(secret: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = (await scrypt(secret, salt, 64)) as Buffer;

  return `scrypt:${salt}:${derivedKey.toString("hex")}`;
}
