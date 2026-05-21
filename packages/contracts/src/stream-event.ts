import { z } from "zod";

import { streamEventKindSchema } from "./database-enums.js";
import { orchestratorStatusEventPayloadSchema } from "./orchestrator-event.js";

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
    payload: orchestratorStatusEventPayloadSchema
  })
]);

export type StreamEvent = z.infer<typeof streamEventSchema>;
