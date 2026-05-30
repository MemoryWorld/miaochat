import { z } from "zod";

import { approvalRequestIdSchema } from "./approval.js";
import { conversationIdSchema, workspaceIdSchema } from "./conversation.js";

export const activityRoundIdSchema = z.string().min(1);

export const activityRoundPhaseSchema = z.enum([
  "approval",
  "coordination",
  "implementation",
  "memory",
  "planning",
  "qa",
  "review"
]);

export const activityRoundStatusSchema = z.enum([
  "failed",
  "pending",
  "running",
  "succeeded",
  "waiting_for_approval"
]);

export const activityRoundStepSchema = z.object({
  createdAt: z.coerce.date(),
  id: z.string().min(1),
  label: z.string().min(1),
  status: activityRoundStatusSchema,
  summary: z.string().nullable().default(null)
});

export const activityRoundSchema = z.object({
  actingTeammateId: z.string().min(1).nullable().default(null),
  actingTeammateName: z.string().min(1).nullable().default(null),
  approvalRequestId: approvalRequestIdSchema.nullable().default(null),
  channelId: z.string().min(1).nullable().default(null),
  conversationId: conversationIdSchema.nullable().default(null),
  createdAt: z.coerce.date(),
  endedAt: z.coerce.date().nullable().default(null),
  id: activityRoundIdSchema,
  metadata: z.record(z.string(), z.unknown()).default({}),
  outputPreview: z.string().nullable().default(null),
  phase: activityRoundPhaseSchema,
  startedAt: z.coerce.date(),
  status: activityRoundStatusSchema,
  steps: z.array(activityRoundStepSchema).default([]),
  summary: z.string().min(1),
  toolActivityPreview: z.string().nullable().default(null),
  updatedAt: z.coerce.date(),
  workflowId: z.string().min(1).nullable().default(null),
  workspaceId: workspaceIdSchema
});

export type ActivityRound = z.infer<typeof activityRoundSchema>;
export type ActivityRoundPhase = z.infer<typeof activityRoundPhaseSchema>;
export type ActivityRoundStatus = z.infer<typeof activityRoundStatusSchema>;
export type ActivityRoundStep = z.infer<typeof activityRoundStepSchema>;
