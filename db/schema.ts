import {
  boolean,
  jsonb,
  primaryKey,
  pgEnum,
  pgTable,
  text,
  timestamp
} from "drizzle-orm/pg-core";

export const artifactKind = pgEnum("artifact_kind", [
  "attachment",
  "diff",
  "image",
  "preview"
]);

export const conversationMode = pgEnum("conversation_mode", [
  "direct",
  "group"
]);

export const credentialSource = pgEnum("credential_source", [
  "platform_managed",
  "user_provided"
]);

export const messageRole = pgEnum("message_role", [
  "assistant",
  "system",
  "user"
]);

export const providerId = pgEnum("provider_id", [
  "claude-code",
  "codex",
  "hermes",
  "mock",
  "openclaw"
]);

const timestampColumns = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
};

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  displayName: text("display_name").notNull(),
  ...timestampColumns
});

export const authCredentials = pgTable("auth_credentials", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  passwordHash: text("password_hash").notNull(),
  passwordResetRequestedAt: timestamp("password_reset_requested_at", {
    withTimezone: true
  }),
  passwordResetTokenExpiresAt: timestamp("password_reset_token_expires_at", {
    withTimezone: true
  }),
  passwordResetTokenHash: text("password_reset_token_hash"),
  ...timestampColumns
});

export const authSessions = pgTable("auth_sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  sessionTokenHash: text("session_token_hash").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  ...timestampColumns
});

export const authLoginAuditEvents = pgTable("auth_login_audit_events", {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  email: text("email").notNull(),
  failureReason: text("failure_reason"),
  id: text("id").primaryKey(),
  ipAddress: text("ip_address").notNull(),
  outcome: text("outcome").notNull(),
  userId: text("user_id").references(() => users.id, { onDelete: "set null" })
});

export const workspaces = pgTable(
  "workspaces",
  {
    id: text("id").notNull(),
    name: text("name").notNull(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    ...timestampColumns
  },
  (table) => ({
    primaryKey: primaryKey({
      columns: [table.ownerUserId, table.id],
      name: "workspaces_pkey"
    })
  })
);

export const conversations = pgTable("conversations", {
  id: text("id").primaryKey(),
  mode: conversationMode("mode").notNull(),
  ownerUserId: text("owner_user_id").notNull(),
  pinnedMessageIds: jsonb("pinned_message_ids").$type<string[]>().notNull().default([]),
  title: text("title").notNull(),
  workspaceId: text("workspace_id").notNull(),
  ...timestampColumns
});

export const conversationAgents = pgTable("conversation_agents", {
  agentId: text("agent_id").notNull(),
  agentName: text("agent_name").notNull(),
  conversationId: text("conversation_id")
    .notNull()
    .references(() => conversations.id, { onDelete: "cascade" }),
  workspaceId: text("workspace_id").notNull()
});

export const messages = pgTable("messages", {
  content: text("content").notNull(),
  conversationId: text("conversation_id")
    .notNull()
    .references(() => conversations.id, { onDelete: "cascade" }),
  id: text("id").primaryKey(),
  isPinned: boolean("is_pinned").notNull().default(false),
  mentionedAgentIds: jsonb("mentioned_agent_ids").$type<string[]>().notNull().default([]),
  ownerUserId: text("owner_user_id").notNull(),
  role: messageRole("role").notNull(),
  sourceAgentId: text("source_agent_id"),
  workspaceId: text("workspace_id").notNull(),
  ...timestampColumns
});

export const providerCredentials = pgTable("provider_credentials", {
  credentialSource: credentialSource("credential_source").notNull(),
  encryptedSecret: text("encrypted_secret").notNull(),
  id: text("id").primaryKey(),
  label: text("label").notNull(),
  ownerUserId: text("owner_user_id").notNull(),
  provider: providerId("provider").notNull(),
  providerAccountId: text("provider_account_id").notNull(),
  validationState: text("validation_state").notNull(),
  workspaceId: text("workspace_id").notNull(),
  ...timestampColumns
});

export const customAgents = pgTable(
  "custom_agents",
  {
    avatarUrl: text("avatar_url"),
    capabilityTags: jsonb("capability_tags").$type<string[]>().notNull().default([]),
    id: text("id").notNull(),
    name: text("name").notNull(),
    ownerUserId: text("owner_user_id").notNull(),
    provider: providerId("provider").notNull(),
    systemPrompt: text("system_prompt").notNull(),
    toolBindings: jsonb("tool_bindings").$type<
      Array<{
        configPath: string | null;
        name: string;
        runtime: "config_file" | "server_registration";
      }>
    >().notNull().default([]),
    workspaceId: text("workspace_id").notNull(),
    ...timestampColumns
  },
  (table) => ({
    primaryKey: primaryKey({
      columns: [table.workspaceId, table.id],
      name: "custom_agents_pkey"
    })
  })
);

export const artifacts = pgTable("artifacts", {
  id: text("id").primaryKey(),
  kind: artifactKind("kind").notNull(),
  messageId: text("message_id")
    .notNull()
    .references(() => messages.id, { onDelete: "cascade" }),
  mimeType: text("mime_type").notNull(),
  previewUrl: text("preview_url"),
  storageKey: text("storage_key"),
  title: text("title").notNull(),
  workspaceId: text("workspace_id").notNull(),
  ...timestampColumns
});
