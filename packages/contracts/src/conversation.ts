import { z } from "zod";

import { conversationModeSchema } from "./database-enums.js";

export const conversationIdSchema = z.string().min(1);
export const workspaceIdSchema = z.string().min(1).default("default-workspace");
export const userIdSchema = z.string().min(1).default("system-user");

export const conversationAgentMemberSchema = z.object({
  agentId: z.string().min(1),
  agentName: z.string().min(1)
});

export const conversationSchema = z.object({
  id: conversationIdSchema,
  title: z.string().min(1).max(120),
  mode: conversationModeSchema,
  ownerUserId: userIdSchema,
  pinnedMessageIds: z.array(z.string().min(1)).default([]),
  updatedAt: z.coerce.date(),
  workspaceId: workspaceIdSchema,
  participants: z.array(conversationAgentMemberSchema).default([])
});

export const createConversationInputSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  mode: conversationModeSchema,
  agentIds: z.array(z.string().min(1)).min(1),
  workspaceId: workspaceIdSchema.optional()
});

export type Conversation = z.infer<typeof conversationSchema>;
export type ConversationAgentMember = z.infer<typeof conversationAgentMemberSchema>;
export type CreateConversationInput = z.infer<typeof createConversationInputSchema>;
