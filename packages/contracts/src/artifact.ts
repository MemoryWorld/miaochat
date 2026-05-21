import { z } from "zod";

import { artifactKindSchema } from "./database-enums.js";
import { workspaceIdSchema } from "./conversation.js";
import { messageIdSchema } from "./message.js";

export const artifactSchema = z.object({
  id: z.string().min(1),
  kind: artifactKindSchema,
  messageId: messageIdSchema,
  title: z.string().min(1),
  mimeType: z.string().min(1),
  previewUrl: z.string().url().nullable().default(null),
  storageKey: z.string().min(1).nullable().default(null),
  workspaceId: workspaceIdSchema,
  createdAt: z.coerce.date()
});

export const createArtifactInputSchema = artifactSchema
  .omit({
    createdAt: true
  })
  .extend({
    id: z.string().min(1).optional(),
    mimeType: z.string().trim().min(1),
    previewUrl: z.string().url().nullable().optional(),
    storageKey: z.string().min(1).nullable().optional(),
    title: z.string().trim().min(1),
    workspaceId: workspaceIdSchema.optional()
  });

export const artifactQuerySchema = z.object({
  messageId: messageIdSchema,
  workspaceId: workspaceIdSchema
});

export const prepareArtifactUploadInputSchema = z.object({
  fileName: z.string().trim().min(1),
  kind: artifactKindSchema,
  messageId: messageIdSchema,
  mimeType: z.string().trim().min(1),
  title: z.string().trim().min(1),
  workspaceId: workspaceIdSchema.optional()
});

export const artifactUploadTargetSchema = z.object({
  artifactId: z.string().min(1),
  previewUrl: z.string().url().nullable().default(null),
  storageKey: z.string().min(1),
  uploadHeaders: z.record(z.string(), z.string()).default({}),
  uploadMethod: z.literal("PUT"),
  uploadUrl: z.string().url(),
  workspaceId: workspaceIdSchema
});

export type Artifact = z.infer<typeof artifactSchema>;
export type ArtifactQuery = z.infer<typeof artifactQuerySchema>;
export type ArtifactUploadTarget = z.infer<typeof artifactUploadTargetSchema>;
export type CreateArtifactInput = z.infer<typeof createArtifactInputSchema>;
export type PrepareArtifactUploadInput = z.infer<typeof prepareArtifactUploadInputSchema>;
