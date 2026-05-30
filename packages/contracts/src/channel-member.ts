import { z } from "zod";

import { userIdSchema, workspaceIdSchema } from "./conversation.js";

export const channelMemberPermissionSchema = z.enum(["read", "comment", "manage"]);
export const channelNotificationPreferenceSchema = z.enum([
  "all",
  "mentions_only",
  "muted"
]);

export const humanChannelMemberRoleSchema = z.enum([
  "admin",
  "guest",
  "member",
  "owner"
]);

export const humanChannelMemberStatusSchema = z.enum([
  "active",
  "disabled",
  "pending"
]);

export const aiChannelMemberStatusSchema = z.enum([
  "available",
  "disabled",
  "running"
]);

export const humanChannelMemberSchema = z.object({
  avatarUrl: z.string().url().nullable().default(null),
  displayName: z.string().min(1),
  joinedAt: z.coerce.date().nullable().default(null),
  kind: z.literal("human"),
  lastActiveAt: z.coerce.date().nullable().default(null),
  memberId: z.string().min(1),
  permission: channelMemberPermissionSchema,
  role: humanChannelMemberRoleSchema,
  status: humanChannelMemberStatusSchema,
  userId: userIdSchema.nullable().default(null)
});

export const aiChannelMemberSchema = z.object({
  avatarUrl: z.string().url().nullable().default(null),
  displayName: z.string().min(1),
  joinedAt: z.coerce.date().nullable().default(null),
  kind: z.literal("ai"),
  lastActiveAt: z.coerce.date().nullable().default(null),
  memberId: z.string().min(1),
  permission: z.literal("comment"),
  role: z.literal("ai_teammate"),
  status: aiChannelMemberStatusSchema,
  teammateId: z.string().min(1)
});

export const channelMemberSchema = z.discriminatedUnion("kind", [
  humanChannelMemberSchema,
  aiChannelMemberSchema
]);

export const addHumanChannelMembersInputSchema = z
  .object({
    emails: z.array(z.string().email()).default([]),
    permission: z.enum(["read", "comment"]).default("comment"),
    userIds: z.array(userIdSchema).default([]),
    workspaceId: workspaceIdSchema
  })
  .superRefine((value, context) => {
    if (value.emails.length === 0 && value.userIds.length === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "At least one user id or email is required.",
        path: ["userIds"]
      });
    }
  });

export const updateHumanChannelMemberInputSchema = z.object({
  permission: z.enum(["read", "comment"]),
  workspaceId: workspaceIdSchema
});

export const channelMemberListSchema = z.object({
  aiCount: z.number().int().min(0),
  channelId: z.string().min(1),
  humanCount: z.number().int().min(0),
  members: z.array(channelMemberSchema),
  totalCount: z.number().int().min(0),
  workspaceId: workspaceIdSchema
});

export const markChannelReadInputSchema = z.object({
  lastReadMessageId: z.string().min(1).nullable().default(null),
  workspaceId: workspaceIdSchema
});

export const updateChannelNotificationPreferenceInputSchema = z.object({
  notificationPreference: channelNotificationPreferenceSchema,
  workspaceId: workspaceIdSchema
});

export const channelReadStateSchema = z.object({
  channelId: z.string().min(1),
  lastReadAt: z.coerce.date().nullable().default(null),
  lastReadMessageId: z.string().min(1).nullable().default(null),
  notificationPreference: channelNotificationPreferenceSchema.default("all"),
  unreadCount: z.number().int().min(0),
  workspaceId: workspaceIdSchema
});

export type AddHumanChannelMembersInput = z.infer<
  typeof addHumanChannelMembersInputSchema
>;
export type AiChannelMember = z.infer<typeof aiChannelMemberSchema>;
export type ChannelMember = z.infer<typeof channelMemberSchema>;
export type ChannelMemberList = z.infer<typeof channelMemberListSchema>;
export type ChannelMemberPermission = z.infer<typeof channelMemberPermissionSchema>;
export type ChannelNotificationPreference = z.infer<
  typeof channelNotificationPreferenceSchema
>;
export type ChannelReadState = z.infer<typeof channelReadStateSchema>;
export type HumanChannelMember = z.infer<typeof humanChannelMemberSchema>;
export type HumanChannelMemberRole = z.infer<typeof humanChannelMemberRoleSchema>;
export type HumanChannelMemberStatus = z.infer<typeof humanChannelMemberStatusSchema>;
export type MarkChannelReadInput = z.infer<typeof markChannelReadInputSchema>;
export type UpdateHumanChannelMemberInput = z.infer<
  typeof updateHumanChannelMemberInputSchema
>;
export type UpdateChannelNotificationPreferenceInput = z.infer<
  typeof updateChannelNotificationPreferenceInputSchema
>;
