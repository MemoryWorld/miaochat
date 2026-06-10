import { z } from "zod";

import { userIdSchema } from "./conversation.js";
import { messageRoleSchema } from "./database-enums.js";

export const messageIdSchema = z.string().min(1);
export const messageAttachmentInputMaxCount = 5;
export const messageAttachmentInputMaxContentChars = 64 * 1024;
export const messageAttachmentInputMaxFileNameChars = 160;

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

export const messageReactionSummarySchema = z.object({
  count: z.number().int().min(0),
  emoji: z.enum(["👍", "✅", "👀"]),
  reactedByCurrentUser: z.boolean().default(false)
});

export const messageAttachmentInputSchema = z.object({
  content: z.string().min(1).max(messageAttachmentInputMaxContentChars),
  fileName: z.string().trim().min(1).max(messageAttachmentInputMaxFileNameChars),
  mimeType: z.string().trim().min(1).max(120).refine(isMessageAttachmentTextMimeType, {
    message: "Only text attachments can be sent in chat messages."
  })
});

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
  reactions: z.array(messageReactionSummarySchema).default([]),
  sourceAgentId: z.string().min(1).nullable().default(null),
  threadLastReplyAt: z.coerce.date().nullable().default(null),
  threadParentMessageId: messageIdSchema.nullable().default(null),
  threadReplyCount: z.number().int().min(0).default(0),
  workspaceId: z.string().min(1).default("default-workspace")
});

export const createMessageInputSchema = z.object({
  attachments: z.array(messageAttachmentInputSchema)
    .max(messageAttachmentInputMaxCount)
    .default([]),
  conversationId: z.string().min(1),
  content: z.string().trim().min(1),
  mentionedAgentIds: z.array(z.string().min(1)).default([]),
  mentionedUserIds: z.array(userIdSchema).default([]),
  role: messageRoleSchema,
  threadParentMessageId: messageIdSchema.nullable().default(null),
  workspaceId: z.string().min(1).default("default-workspace")
});

export function isMessageAttachmentTextMimeType(mimeType: string): boolean {
  const normalized = mimeType.trim().toLowerCase();

  return (
    normalized.startsWith("text/") ||
    normalized.includes("markdown") ||
    normalized.includes("json") ||
    normalized.includes("xml") ||
    normalized === "application/javascript" ||
    normalized === "application/typescript" ||
    normalized === "application/x-typescript" ||
    normalized === "application/x-yaml" ||
    normalized === "application/yaml"
  );
}

export const toggleMessageReactionInputSchema = z.object({
  emoji: z.enum(["👍", "✅", "👀"]),
  workspaceId: z.string().min(1).default("default-workspace")
});

export const messageThreadSchema = z.object({
  parent: messageSchema,
  replies: z.array(messageSchema)
});

export type CreateMessageInput = z.infer<typeof createMessageInputSchema>;
export type MessageAuthor = z.infer<typeof messageAuthorSchema>;
export type MessageAttachmentInput = z.infer<typeof messageAttachmentInputSchema>;
export type Message = z.infer<typeof messageSchema>;
export type MessageReactionSummary = z.infer<typeof messageReactionSummarySchema>;
export type MessageThread = z.infer<typeof messageThreadSchema>;
export type ToggleMessageReactionInput = z.infer<typeof toggleMessageReactionInputSchema>;
