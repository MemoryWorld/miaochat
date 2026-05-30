import { z } from "zod";

import {
  builtInCodingRoleSchema,
  runtimeBackendSchema,
  type BuiltInCodingProfile
} from "./coding-workflow.js";
import { workspaceIdSchema, userIdSchema } from "./conversation.js";
import {
  buildExecutionPlaneBinding,
  executionPlaneSchema,
  type ExecutionPlane
} from "./runtime-execution.js";

export const workspacePrincipalKindSchema = z.enum([
  "ai_teammate",
  "human"
]);

export const channelSourceTypeSchema = z.enum([
  "conversation",
  "workspace_defined"
]);

export const channelVisibilitySchema = z.enum([
  "members_only",
  "workspace"
]);

export const channelMembershipSchema = z.object({
  channelId: z.string().min(1),
  title: z.string().min(1),
  visibility: channelVisibilitySchema
});

export const channelSummarySchema = z.object({
  conversationId: z.string().min(1).nullable().default(null),
  id: z.string().min(1),
  memberTeammateIds: z.array(z.string().min(1)).default([]),
  sourceType: channelSourceTypeSchema,
  summary: z.string().nullable().default(null),
  title: z.string().min(1),
  unreadCount: z.number().int().min(0).default(0),
  updatedAt: z.coerce.date(),
  visibility: channelVisibilitySchema,
  workspaceId: workspaceIdSchema
});

export const actorTabIdSchema = z.enum([
  "activity",
  "calendar",
  "channels",
  "chat",
  "files",
  "memory",
  "settings",
  "skills",
  "tasks"
]);

export const actorProfileSchema = z.object({
  agentId: z.string().min(1).nullable().default(null),
  avatarUrl: z.string().url().nullable().default(null),
  builtInRole: builtInCodingRoleSchema.nullable().default(null),
  capabilityTags: z.array(z.string().min(1)).default([]),
  channelMemberships: z.array(channelMembershipSchema).default([]),
  executionPlane: executionPlaneSchema,
  id: z.string().min(1),
  kind: z.enum(["builtin", "custom"]),
  mission: z.string().min(1),
  name: z.string().min(1),
  runtimeBackend: runtimeBackendSchema.nullable().default(null),
  summary: z.string().min(1),
  workspaceId: workspaceIdSchema
});

export const inboxItemKindSchema = z.enum([
  "activity_update",
  "approval_request",
  "calendar_update",
  "connection_alert",
  "failure_summary",
  "mention",
  "task_update",
  "workflow_update"
]);

export const inboxItemStatusSchema = z.enum([
  "action_required",
  "info",
  "resolved"
]);

export const inboxItemSchema = z.object({
  activityRoundId: z.string().min(1).nullable().default(null),
  approvalRequestId: z.string().min(1).nullable().default(null),
  channelId: z.string().min(1).nullable().default(null),
  createdAt: z.coerce.date(),
  id: z.string().min(1),
  kind: inboxItemKindSchema,
  routeHref: z.string().min(1).nullable().default(null),
  status: inboxItemStatusSchema,
  summary: z.string().min(1),
  teammateId: z.string().min(1).nullable().default(null),
  title: z.string().min(1),
  updatedAt: z.coerce.date(),
  workflowId: z.string().min(1).nullable().default(null),
  workspaceId: workspaceIdSchema
});

export const taskStateSchema = z.enum([
  "blocked",
  "done",
  "in_progress",
  "in_review",
  "todo"
]);

export const taskPrioritySchema = z.enum([
  "high",
  "low",
  "normal",
  "urgent"
]);

export const taskOwnerScopeSchema = z.enum([
  "channel",
  "teammate",
  "workflow",
  "workspace"
]);

export const workspaceTaskSchema = z.object({
  channelId: z.string().min(1).nullable().default(null),
  createdAt: z.coerce.date(),
  dueAt: z.coerce.date().nullable().default(null),
  id: z.string().min(1),
  ownerScope: taskOwnerScopeSchema,
  ownerScopeId: z.string().min(1).nullable().default(null),
  priority: taskPrioritySchema,
  sourceKind: z.enum(["coding_workflow", "manual"]),
  state: taskStateSchema,
  summary: z.string().nullable().default(null),
  teammateId: z.string().min(1).nullable().default(null),
  title: z.string().min(1),
  updatedAt: z.coerce.date(),
  workflowId: z.string().min(1).nullable().default(null),
  workspaceId: workspaceIdSchema
});

export const calendarEventStatusSchema = z.enum([
  "completed",
  "in_progress",
  "scheduled"
]);

export const calendarEventSchema = z.object({
  channelId: z.string().min(1).nullable().default(null),
  endAt: z.coerce.date().nullable().default(null),
  id: z.string().min(1),
  ownerScope: taskOwnerScopeSchema,
  ownerScopeId: z.string().min(1).nullable().default(null),
  startAt: z.coerce.date(),
  status: calendarEventStatusSchema,
  summary: z.string().nullable().default(null),
  teammateId: z.string().min(1).nullable().default(null),
  title: z.string().min(1),
  workflowId: z.string().min(1).nullable().default(null),
  workspaceId: workspaceIdSchema
});

export const fileSurfaceEntrySchema = z.object({
  channelId: z.string().min(1).nullable().default(null),
  conversationId: z.string().min(1).nullable().default(null),
  createdAt: z.coerce.date(),
  id: z.string().min(1),
  kind: z.enum(["attachment", "diff", "image", "preview"]),
  messageId: z.string().min(1),
  mimeType: z.string().min(1),
  previewUrl: z.string().nullable().default(null),
  title: z.string().min(1),
  workspaceId: workspaceIdSchema
});

export const workspaceMemberDirectoryEntrySchema = z.object({
  actorType: z.enum(["ai", "human"]).default("human"),
  displayName: z.string().min(1),
  id: z.string().min(1),
  joinedAt: z.coerce.date().nullable().default(null),
  lastActiveAt: z.coerce.date().nullable().default(null),
  principalKind: workspacePrincipalKindSchema,
  role: z.enum(["admin", "agent", "member", "owner", "viewer"]).default("member"),
  roleLabel: z.string().min(1),
  status: z.enum(["active", "disabled", "invited"]).default("active"),
  summary: z.string().nullable().default(null),
  teammateId: z.string().min(1).nullable().default(null),
  userId: userIdSchema.nullable().default(null),
  workspaceId: workspaceIdSchema
});

export const billingPlanSummarySchema = z.object({
  aiTeammateCount: z.number().int().min(0),
  billingMode: z.enum(["platform_managed", "user_provided_keys"]),
  currentPlan: z.string().min(1),
  invoiceStatus: z.enum(["none", "paid", "pending"]).default("none"),
  memberCount: z.number().int().min(0),
  monthlyQuota: z.number().int().min(0),
  monthlyUsage: z.number().int().min(0),
  modelCostSummary: z.string().min(1),
  paymentMethodStatus: z.enum(["missing", "ready"]).default("missing"),
  workspaceId: workspaceIdSchema
});

export const capabilityInstallStateSchema = z.enum([
  "available",
  "disabled",
  "enabled",
  "installed"
]);

export const capabilityManagementEntrySchema = z.object({
  compatibleRoles: z.array(z.string().min(1)).default([]),
  enabled: z.boolean(),
  id: z.string().min(1),
  installState: capabilityInstallStateSchema,
  name: z.string().min(1),
  permissionScope: z.string().min(1),
  riskNote: z.string().min(1),
  source: z.string().min(1),
  summary: z.string().min(1),
  version: z.string().min(1),
  workspaceId: workspaceIdSchema
});

export type ActorProfile = z.infer<typeof actorProfileSchema>;
export type ActorTabId = z.infer<typeof actorTabIdSchema>;
export type CalendarEvent = z.infer<typeof calendarEventSchema>;
export type CalendarEventStatus = z.infer<typeof calendarEventStatusSchema>;
export type BillingPlanSummary = z.infer<typeof billingPlanSummarySchema>;
export type CapabilityManagementEntry = z.infer<typeof capabilityManagementEntrySchema>;
export type CapabilityInstallState = z.infer<typeof capabilityInstallStateSchema>;
export type ChannelSummary = z.infer<typeof channelSummarySchema>;
export type ChannelVisibility = z.infer<typeof channelVisibilitySchema>;
export type FileSurfaceEntry = z.infer<typeof fileSurfaceEntrySchema>;
export type InboxItem = z.infer<typeof inboxItemSchema>;
export type InboxItemKind = z.infer<typeof inboxItemKindSchema>;
export type InboxItemStatus = z.infer<typeof inboxItemStatusSchema>;
export type TaskOwnerScope = z.infer<typeof taskOwnerScopeSchema>;
export type TaskPriority = z.infer<typeof taskPrioritySchema>;
export type TaskState = z.infer<typeof taskStateSchema>;
export type WorkspaceMemberDirectoryEntry = z.infer<typeof workspaceMemberDirectoryEntrySchema>;
export type WorkspaceTask = z.infer<typeof workspaceTaskSchema>;

export function buildBuiltInActorProfile(input: {
  profile: BuiltInCodingProfile;
  workspaceId: string;
  channelMemberships?: Array<{ channelId: string; title: string; visibility: "members_only" | "workspace" }>;
  runtimeBackend?: z.infer<typeof runtimeBackendSchema>;
}): ActorProfile {
  const binding = buildExecutionPlaneBinding({
    role: input.profile.id,
    runtimeBackend: input.runtimeBackend ?? input.profile.runtimeBackend
  });

  return actorProfileSchema.parse({
    agentId: null,
    avatarUrl: null,
    builtInRole: input.profile.id,
    capabilityTags: input.profile.capabilityTags,
    channelMemberships: input.channelMemberships ?? [],
    executionPlane: binding.executionPlane,
    id: input.profile.id,
    kind: "builtin",
    mission: input.profile.mission,
    name: input.profile.name,
    runtimeBackend: input.runtimeBackend ?? input.profile.runtimeBackend,
    summary: input.profile.summary,
    workspaceId: input.workspaceId
  });
}

export function buildCustomActorProfile(input: {
  agentId: string;
  avatarUrl?: string | null;
  capabilityTags?: string[];
  channelMemberships?: Array<{ channelId: string; title: string; visibility: "members_only" | "workspace" }>;
  executionPlane?: ExecutionPlane;
  mission: string;
  name: string;
  runtimeBackend?: z.infer<typeof runtimeBackendSchema> | null;
  workspaceId: string;
}): ActorProfile {
  return actorProfileSchema.parse({
    agentId: input.agentId,
    avatarUrl: input.avatarUrl ?? null,
    builtInRole: null,
    capabilityTags: input.capabilityTags ?? [],
    channelMemberships: input.channelMemberships ?? [],
    executionPlane: input.executionPlane ?? "deferred_remote",
    id: input.agentId,
    kind: "custom",
    mission: input.mission,
    name: input.name,
    runtimeBackend: input.runtimeBackend ?? null,
    summary: input.mission,
    workspaceId: input.workspaceId
  });
}
