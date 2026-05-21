import { z } from "zod";

import { streamEventKindSchema } from "./database-enums.js";

const startedPayloadSchema = z.object({
  messageId: z.string().min(1)
});

const deltaPayloadSchema = z.object({
  delta: z.string(),
  messageId: z.string().min(1)
});

const completedPayloadSchema = z.object({
  finalContent: z.string(),
  messageId: z.string().min(1)
});

const statusPayloadSchema = z.object({
  label: z.string().min(1),
  state: z.enum(["failed", "running", "succeeded"])
});

export const streamEventSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal(streamEventKindSchema.enum["conversation.message.started"]),
    payload: startedPayloadSchema
  }),
  z.object({
    kind: z.literal(streamEventKindSchema.enum["conversation.message.delta"]),
    payload: deltaPayloadSchema
  }),
  z.object({
    kind: z.literal(streamEventKindSchema.enum["conversation.message.completed"]),
    payload: completedPayloadSchema
  }),
  z.object({
    kind: z.literal(streamEventKindSchema.enum["conversation.status"]),
    payload: statusPayloadSchema
  })
]);

export type StreamEvent = z.infer<typeof streamEventSchema>;
