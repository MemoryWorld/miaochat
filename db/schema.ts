import {
  boolean,
  integer,
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

export const runtimeBackend = pgEnum("runtime_backend", [
  "enhanced-hermes",
  "claude-code-internal",
  "hermes-compat",
  "openclaw-compat",
  "mock"
]);

export const credentialSource = pgEnum("credential_source", [
  "platform_managed",
  "user_provided"
]);

export const deployTargetKind = pgEnum("deploy_target_kind", [
  "static-site",
  "container",
  "source-archive"
]);

export const deploymentStatus = pgEnum("deployment_status", [
  "queued",
  "running",
  "succeeded",
  "failed"
]);

export const messageRole = pgEnum("message_role", [
  "assistant",
  "system",
  "user"
]);

export const codingWorkflowState = pgEnum("coding_workflow_state", [
  "plan_pending_approval",
  "plan_rejected",
  "plan_revision_requested",
  "execution_running",
  "review_running",
  "qa_running",
  "awaiting_user_confirmation",
  "completed"
]);

export const codingWorkflowApprovalState = pgEnum("coding_workflow_approval_state", [
  "pending",
  "approved",
  "rejected",
  "revision_requested"
]);

export const codingWorkflowDecision = pgEnum("coding_workflow_decision", [
  "approved",
  "rejected",
  "revision_requested"
]);

export const codingWorkflowPriority = pgEnum("coding_workflow_priority", [
  "low",
  "normal",
  "high"
]);

export const providerId = pgEnum("provider_id", [
  "claude-code",
  "codex",
  "deepseek",
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
  modelConnectionPreset: text("model_connection_preset"),
  ownerUserId: text("owner_user_id").notNull(),
  provider: providerId("provider").notNull(),
  providerAccountId: text("provider_account_id").notNull(),
  validationState: text("validation_state").notNull(),
  workspaceId: text("workspace_id").notNull(),
  ...timestampColumns
});

export const credentialPoolEntries = pgTable("credential_pool_entries", {
  credentialSource: credentialSource("credential_source")
    .notNull()
    .default("platform_managed"),
  encryptedSecret: text("encrypted_secret").notNull(),
  id: text("id").primaryKey(),
  isActive: boolean("is_active").notNull().default(true),
  label: text("label").notNull(),
  provider: providerId("provider").notNull(),
  providerAccountId: text("provider_account_id").notNull(),
  quotaClass: text("quota_class").notNull(),
  region: text("region").notNull(),
  tier: text("tier").notNull(),
  ...timestampColumns
});

export const workspaceProviderQuotaPeriods = pgTable("workspace_provider_quota_periods", {
  consumedUnits: integer("consumed_units").notNull().default(0),
  id: text("id").primaryKey(),
  periodEndsAt: timestamp("period_ends_at", { withTimezone: true }).notNull(),
  periodStartedAt: timestamp("period_started_at", { withTimezone: true }).notNull(),
  provider: providerId("provider").notNull(),
  quotaClass: text("quota_class").notNull().default("standard"),
  quotaLimit: integer("quota_limit").notNull(),
  renewsAt: timestamp("renews_at", { withTimezone: true }).notNull(),
  workspaceId: text("workspace_id").notNull(),
  ...timestampColumns
});

export const workspaceProviderCredentialModes = pgTable(
  "workspace_provider_credential_modes",
  {
    credentialSource: credentialSource("credential_source").notNull(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: providerId("provider").notNull(),
    workspaceId: text("workspace_id").notNull(),
    ...timestampColumns
  },
  (table) => ({
    primaryKey: primaryKey({
      columns: [table.ownerUserId, table.workspaceId, table.provider],
      name: "workspace_provider_credential_modes_pkey"
    })
  })
);

export const deployTargets = pgTable("deploy_targets", {
  config: jsonb("config").$type<Record<string, unknown>>().notNull().default({}),
  credentialSource: credentialSource("credential_source").notNull(),
  encryptedSecret: text("encrypted_secret"),
  id: text("id").primaryKey(),
  kind: deployTargetKind("kind").notNull(),
  name: text("name").notNull(),
  ownerUserId: text("owner_user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  workspaceId: text("workspace_id").notNull(),
  ...timestampColumns
});

export const deployments = pgTable("deployments", {
  artifactId: text("artifact_id")
    .notNull()
    .references(() => artifacts.id, { onDelete: "cascade" }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  deployTargetId: text("deploy_target_id")
    .notNull()
    .references(() => deployTargets.id, { onDelete: "cascade" }),
  errorMessage: text("error_message"),
  id: text("id").primaryKey(),
  ownerUserId: text("owner_user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  previewUrl: text("preview_url"),
  progressEvents: jsonb("progress_events")
    .$type<
      Array<{
        at: string;
        label:
          | "deployment.received"
          | "deployment.running"
          | "deployment.completed"
          | "deployment.failed";
        message: string;
        metadata: Record<string, unknown>;
        status: "failed" | "queued" | "running" | "succeeded";
      }>
    >()
    .notNull()
    .default([]),
  resultMessage: text("result_message").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  status: deploymentStatus("status").notNull(),
  targetKind: deployTargetKind("target_kind").notNull(),
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
    modelProfileId: text("model_profile_id"),
    memoryMode: text("memory_mode").notNull().default("workspace_plus_teammate"),
    approvalMode: text("approval_mode").notNull().default("balanced"),
    outputStyle: text("output_style").notNull().default("清晰、结构化、先给结论再给步骤。"),
    scopeDescription: text("scope_description"),
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

export const codingWorkflows = pgTable("coding_workflows", {
  activePlanVersion: integer("active_plan_version").notNull().default(1),
  approvalState: codingWorkflowApprovalState("approval_state").notNull().default("pending"),
  conversationId: text("conversation_id")
    .notNull()
    .references(() => conversations.id, { onDelete: "cascade" }),
  deadline: text("deadline"),
  engineerAgentId: text("engineer_agent_id").notNull(),
  executionStageAssignments: jsonb("execution_stage_assignments").$type<
    Array<{
      agentId: string;
      role: "code_reviewer" | "qa_tester" | "software_engineer" | "tech_lead";
    }>
  >().notNull().default([]),
  extraAgentIds: jsonb("extra_agent_ids").$type<string[]>().notNull().default([]),
  goal: text("goal").notNull(),
  id: text("id").primaryKey(),
  kickoffMessageId: text("kickoff_message_id"),
  ownerUserId: text("owner_user_id").notNull(),
  planMessageId: text("plan_message_id"),
  planningRole: text("planning_role").$type<
    "code_reviewer" | "qa_tester" | "software_engineer" | "tech_lead"
  >().notNull(),
  planningTeammateId: text("planning_teammate_id").notNull(),
  priority: codingWorkflowPriority("priority").notNull().default("normal"),
  qaAgentId: text("qa_agent_id").notNull(),
  repoContext: text("repo_context"),
  reviewerAgentId: text("reviewer_agent_id").notNull(),
  runtimeBackend: runtimeBackend("runtime_backend").notNull().default("enhanced-hermes"),
  state: codingWorkflowState("state").notNull().default("plan_pending_approval"),
  taskSnapshot: jsonb("task_snapshot").$type<
    Array<{
      id: string;
      ownerRole: "code_reviewer" | "qa_tester" | "software_engineer" | "tech_lead";
      state: "done" | "in_progress" | "in_review" | "todo";
      title: string;
    }>
  >().notNull().default([]),
  techLeadAgentId: text("tech_lead_agent_id").notNull(),
  workspaceId: text("workspace_id").notNull(),
  ...timestampColumns
});

export const codingWorkflowApprovals = pgTable("coding_workflow_approvals", {
  actorUserId: text("actor_user_id").notNull(),
  decision: codingWorkflowDecision("decision").notNull(),
  id: text("id").primaryKey(),
  note: text("note"),
  ownerUserId: text("owner_user_id").notNull(),
  planVersion: integer("plan_version").notNull(),
  workflowId: text("workflow_id")
    .notNull()
    .references(() => codingWorkflows.id, { onDelete: "cascade" }),
  workspaceId: text("workspace_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const teammateChannelMemberships = pgTable("teammate_channel_memberships", {
  channelId: text("channel_id").notNull(),
  id: text("id").primaryKey(),
  ownerUserId: text("owner_user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  teammateId: text("teammate_id").notNull(),
  teammateKind: text("teammate_kind").notNull().default("custom_agent"),
  workspaceId: text("workspace_id").notNull(),
  ...timestampColumns
});

export const workspaceTasks = pgTable("workspace_tasks", {
  channelId: text("channel_id"),
  dueAt: timestamp("due_at", { withTimezone: true }),
  id: text("id").primaryKey(),
  ownerScope: text("owner_scope").notNull(),
  ownerScopeId: text("owner_scope_id"),
  ownerUserId: text("owner_user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  priority: text("priority").notNull().default("normal"),
  sourceKind: text("source_kind").notNull().default("manual"),
  sourceRefId: text("source_ref_id"),
  state: text("state").notNull().default("todo"),
  summary: text("summary"),
  teammateId: text("teammate_id"),
  title: text("title").notNull(),
  workflowId: text("workflow_id").references(() => codingWorkflows.id, {
    onDelete: "set null"
  }),
  workspaceId: text("workspace_id").notNull(),
  ...timestampColumns
});

export const calendarEvents = pgTable("calendar_events", {
  channelId: text("channel_id"),
  endAt: timestamp("end_at", { withTimezone: true }),
  id: text("id").primaryKey(),
  ownerScope: text("owner_scope").notNull(),
  ownerScopeId: text("owner_scope_id"),
  ownerUserId: text("owner_user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  startAt: timestamp("start_at", { withTimezone: true }).notNull(),
  status: text("status").notNull().default("scheduled"),
  summary: text("summary"),
  teammateId: text("teammate_id"),
  title: text("title").notNull(),
  workflowId: text("workflow_id").references(() => codingWorkflows.id, {
    onDelete: "set null"
  }),
  workspaceId: text("workspace_id").notNull(),
  ...timestampColumns
});

export const approvalRequests = pgTable("approval_requests", {
  conversationId: text("conversation_id").references(() => conversations.id, {
    onDelete: "cascade"
  }),
  id: text("id").primaryKey(),
  kind: text("kind").notNull(),
  note: text("note"),
  ownerUserId: text("owner_user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  planVersion: integer("plan_version"),
  requesterTeammateId: text("requester_teammate_id"),
  requesterTeammateName: text("requester_teammate_name"),
  respondedAt: timestamp("responded_at", { withTimezone: true }),
  responseNote: text("response_note"),
  status: text("status").notNull(),
  summary: text("summary").notNull(),
  targetUserId: text("target_user_id"),
  title: text("title").notNull(),
  workflowId: text("workflow_id").references(() => codingWorkflows.id, {
    onDelete: "cascade"
  }),
  workspaceId: text("workspace_id").notNull(),
  ...timestampColumns
});

export const activityRounds = pgTable("activity_rounds", {
  actingTeammateId: text("acting_teammate_id"),
  actingTeammateName: text("acting_teammate_name"),
  approvalRequestId: text("approval_request_id"),
  channelId: text("channel_id"),
  conversationId: text("conversation_id").references(() => conversations.id, {
    onDelete: "cascade"
  }),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  id: text("id").primaryKey(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  outputPreview: text("output_preview"),
  ownerUserId: text("owner_user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  phase: text("phase").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  status: text("status").notNull(),
  summary: text("summary").notNull(),
  toolActivityPreview: text("tool_activity_preview"),
  workflowId: text("workflow_id").references(() => codingWorkflows.id, {
    onDelete: "cascade"
  }),
  workspaceId: text("workspace_id").notNull(),
  ...timestampColumns
});

export const activityRoundSteps = pgTable("activity_round_steps", {
  id: text("id").primaryKey(),
  label: text("label").notNull(),
  roundId: text("round_id")
    .notNull()
    .references(() => activityRounds.id, { onDelete: "cascade" }),
  status: text("status").notNull(),
  summary: text("summary"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const memoryRecords = pgTable("memory_records", {
  content: text("content").notNull(),
  conversationId: text("conversation_id").references(() => conversations.id, {
    onDelete: "cascade"
  }),
  id: text("id").primaryKey(),
  ownerUserId: text("owner_user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  scope: text("scope").notNull(),
  source: text("source").notNull().default("manual"),
  teammateId: text("teammate_id"),
  title: text("title").notNull(),
  workspaceId: text("workspace_id").notNull(),
  ...timestampColumns
});

export const workspaceSkillBindings = pgTable("workspace_skill_bindings", {
  enabled: boolean("enabled").notNull().default(true),
  id: text("id").primaryKey(),
  ownerUserId: text("owner_user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  skillId: text("skill_id").notNull(),
  source: text("source").notNull().default("workspace"),
  teammateId: text("teammate_id"),
  workspaceId: text("workspace_id").notNull(),
  ...timestampColumns
});

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
