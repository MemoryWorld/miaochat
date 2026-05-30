import { z } from "zod";

import { userIdSchema } from "./conversation.js";
import { messageRoleSchema } from "./database-enums.js";

export const messageIdSchema = z.string().min(1);

export const messageAuthorSchema = z.discriminatedUnion("kind", [
  z.object({
    avatarUrl: z.string().url().nullable().default(null),
    displayName: z.string().min(1),
    isCurrentUser: z.boolean().default(false),
    kind: z.literal("human"),
    userId: userIdSchema
  }),
  z.object({
    avatarUrl: z.string().url().nullable().default(null),
    displayName: z.string().min(1),
    kind: z.literal("ai"),
    teammateId: z.string().min(1)
  }),
  z.object({
    displayName: z.string().min(1).default("系统"),
    kind: z.literal("system")
  })
]);

export const messageSchema = z.object({
  id: messageIdSchema,
  conversationId: z.string().min(1),
  ownerUserId: userIdSchema,
  authorUserId: userIdSchema.nullable().default(null),
  author: messageAuthorSchema.nullable().default(null),
  role: messageRoleSchema,
  content: z.string().min(1),
  createdAt: z.coerce.date(),
  isPinned: z.boolean().default(false),
  mentionedAgentIds: z.array(z.string().min(1)).default([]),
  mentionedUserIds: z.array(userIdSchema).default([]),
  sourceAgentId: z.string().min(1).nullable().default(null),
  workspaceId: z.string().min(1).default("default-workspace")
});

export const createMessageInputSchema = z.object({
  conversationId: z.string().min(1),
  content: z.string().trim().min(1),
  mentionedAgentIds: z.array(z.string().min(1)).default([]),
  mentionedUserIds: z.array(userIdSchema).default([]),
  role: messageRoleSchema,
  workspaceId: z.string().min(1).default("default-workspace")
});

export type CreateMessageInput = z.infer<typeof createMessageInputSchema>;
export type MessageAuthor = z.infer<typeof messageAuthorSchema>;
export type Message = z.infer<typeof messageSchema>;
