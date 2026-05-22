import { z } from "zod";

import { conversationIdSchema, userIdSchema, workspaceIdSchema } from "./conversation.js";

export const presenceActionSchema = z.enum([
  "joined",
  "left",
  "typing",
  "read"
]);

export const presenceEventSchema = z.object({
  kind: z.literal("conversation.presence"),
  payload: z.object({
    action: presenceActionSchema,
    conversationId: conversationIdSchema,
    lastReadMessageId: z.string().min(1).nullable().default(null),
    timestamp: z.coerce.date(),
    userId: userIdSchema,
    workspaceId: workspaceIdSchema
  })
});

export const presenceSnapshotSchema = z.object({
  conversationId: conversationIdSchema,
  participants: z.array(
    z.object({
      action: presenceActionSchema,
      lastReadMessageId: z.string().min(1).nullable().default(null),
      timestamp: z.coerce.date(),
      userId: userIdSchema
    })
  )
});

export type PresenceAction = z.infer<typeof presenceActionSchema>;
export type PresenceEvent = z.infer<typeof presenceEventSchema>;
export type PresenceSnapshot = z.infer<typeof presenceSnapshotSchema>;
