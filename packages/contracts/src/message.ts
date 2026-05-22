import { z } from "zod";

import { userIdSchema } from "./conversation.js";
import { messageRoleSchema } from "./database-enums.js";

export const messageIdSchema = z.string().min(1);

export const messageSchema = z.object({
  id: messageIdSchema,
  conversationId: z.string().min(1),
  ownerUserId: userIdSchema,
  role: messageRoleSchema,
  content: z.string().min(1),
  createdAt: z.coerce.date(),
  isPinned: z.boolean().default(false),
  mentionedAgentIds: z.array(z.string().min(1)).default([]),
  sourceAgentId: z.string().min(1).nullable().default(null),
  workspaceId: z.string().min(1).default("default-workspace")
});

export const createMessageInputSchema = z.object({
  conversationId: z.string().min(1),
  content: z.string().trim().min(1),
  mentionedAgentIds: z.array(z.string().min(1)).default([]),
  role: messageRoleSchema,
  workspaceId: z.string().min(1).default("default-workspace")
});

export type CreateMessageInput = z.infer<typeof createMessageInputSchema>;
export type Message = z.infer<typeof messageSchema>;
