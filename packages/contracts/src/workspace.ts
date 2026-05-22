import { z } from "zod";

import { userIdSchema, workspaceIdSchema } from "./conversation.js";

export const workspaceRoleSchema = z.enum(["owner", "admin", "member"]);

export const workspaceSchema = z.object({
  id: workspaceIdSchema,
  name: z.string().min(1).max(120),
  ownerUserId: userIdSchema,
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date()
});

export const workspaceMemberSchema = z.object({
  workspaceId: workspaceIdSchema,
  workspaceOwnerUserId: userIdSchema,
  userId: userIdSchema,
  role: workspaceRoleSchema,
  joinedAt: z.coerce.date()
});

export const workspaceInvitationStatusSchema = z.enum([
  "accepted",
  "expired",
  "pending",
  "revoked"
]);

export const workspaceInvitationSchema = z.object({
  id: z.string().min(1),
  workspaceId: workspaceIdSchema,
  workspaceOwnerUserId: userIdSchema,
  invitedEmail: z.string().email(),
  invitedByUserId: userIdSchema,
  role: workspaceRoleSchema,
  status: workspaceInvitationStatusSchema,
  expiresAt: z.coerce.date(),
  acceptedAt: z.coerce.date().nullable().default(null),
  acceptedUserId: userIdSchema.nullable().default(null),
  createdAt: z.coerce.date()
});

export const createWorkspaceInvitationInputSchema = z.object({
  invitedEmail: z.string().trim().email(),
  role: workspaceRoleSchema.optional().default("member")
});

export type WorkspaceRole = z.infer<typeof workspaceRoleSchema>;
export type Workspace = z.infer<typeof workspaceSchema>;
export type WorkspaceMember = z.infer<typeof workspaceMemberSchema>;
export type WorkspaceInvitation = z.infer<typeof workspaceInvitationSchema>;
export type CreateWorkspaceInvitationInput = z.infer<
  typeof createWorkspaceInvitationInputSchema
>;
