import { z } from "zod";

import { conversationIdSchema, workspaceIdSchema } from "./conversation.js";

export const memoryRecordIdSchema = z.string().min(1);

export const memoryScopeSchema = z.enum([
  "actor",
  "repo",
  "session",
  "workspace"
]);

export const memorySourceSchema = z.enum([
  "actor_self_memory",
  "manual",
  "runtime_summary",
  "workflow"
]);

export const memoryRecordSchema = z.object({
  content: z.string().min(1),
  conversationId: conversationIdSchema.nullable().default(null),
  createdAt: z.coerce.date(),
  id: memoryRecordIdSchema,
  scope: memoryScopeSchema,
  source: memorySourceSchema,
  teammateId: z.string().min(1).nullable().default(null),
  title: z.string().min(1),
  updatedAt: z.coerce.date(),
  workspaceId: workspaceIdSchema
});

export const createMemoryRecordInputSchema = z.object({
  content: z.string().trim().min(1),
  conversationId: conversationIdSchema.optional(),
  scope: memoryScopeSchema,
  source: memorySourceSchema.default("manual"),
  teammateId: z.string().min(1).optional(),
  title: z.string().trim().min(1),
  workspaceId: workspaceIdSchema.default("default-workspace")
});

export type CreateMemoryRecordInput = z.infer<typeof createMemoryRecordInputSchema>;
export type MemoryRecord = z.infer<typeof memoryRecordSchema>;
export type MemoryScope = z.infer<typeof memoryScopeSchema>;
