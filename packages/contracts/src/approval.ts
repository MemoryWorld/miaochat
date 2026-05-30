import { z } from "zod";

import { conversationIdSchema, userIdSchema, workspaceIdSchema } from "./conversation.js";

export const approvalRequestIdSchema = z.string().min(1);

export const approvalRequestKindSchema = z.enum([
  "coding_plan",
  "deployment",
  "file_change",
  "high_risk_action"
]);

export const approvalRequestStatusSchema = z.enum([
  "approved",
  "pending",
  "rejected",
  "revision_requested"
]);

export const approvalRequestSchema = z.object({
  conversationId: conversationIdSchema.nullable().default(null),
  createdAt: z.coerce.date(),
  id: approvalRequestIdSchema,
  kind: approvalRequestKindSchema,
  note: z.string().nullable().default(null),
  planVersion: z.number().int().positive().nullable().default(null),
  requesterTeammateId: z.string().min(1).nullable().default(null),
  requesterTeammateName: z.string().min(1).nullable().default(null),
  respondedAt: z.coerce.date().nullable().default(null),
  responseNote: z.string().nullable().default(null),
  status: approvalRequestStatusSchema,
  summary: z.string().min(1),
  targetUserId: userIdSchema.nullable().default(null),
  title: z.string().min(1),
  updatedAt: z.coerce.date(),
  workflowId: z.string().min(1).nullable().default(null),
  workspaceId: workspaceIdSchema
});

export type ApprovalRequest = z.infer<typeof approvalRequestSchema>;
export type ApprovalRequestKind = z.infer<typeof approvalRequestKindSchema>;
export type ApprovalRequestStatus = z.infer<typeof approvalRequestStatusSchema>;
