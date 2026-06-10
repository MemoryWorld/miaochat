import { z } from "zod";

import { workspaceIdSchema } from "./conversation.js";

export const artifactRevisionSchema = z.object({
  artifactId: z.string().min(1),
  authorUserId: z.string().min(1).nullable().default(null),
  contentDigest: z.string().regex(/^[a-f0-9]{64}$/),
  createdAt: z.coerce.date(),
  id: z.string().min(1),
  parentRevisionId: z.string().min(1).nullable().default(null),
  previewUrl: z.string().nullable().default(null),
  revisionIndex: z.number().int().nonnegative(),
  storageKey: z.string().nullable().default(null),
  summary: z.string().nullable().default(null),
  workspaceId: workspaceIdSchema
});

export const createArtifactRevisionInputSchema = z.object({
  authorUserId: z.string().min(1).optional(),
  contentDigest: z.string().regex(/^[a-f0-9]{64}$/),
  previewUrl: z.string().nullable().optional(),
  storageKey: z.string().nullable().optional(),
  summary: z.string().max(2000).optional()
});

export const artifactRevisionDiffSchema = z.object({
  after: artifactRevisionSchema,
  before: artifactRevisionSchema.nullable(),
  patch: z.string(),
  truncated: z.boolean().default(false)
});

export const restoreArtifactRevisionInputSchema = z.object({
  authorUserId: z.string().min(1).optional(),
  summary: z.string().max(2000).optional()
});

export type ArtifactRevision = z.infer<typeof artifactRevisionSchema>;
export type ArtifactRevisionDiff = z.infer<typeof artifactRevisionDiffSchema>;
export type CreateArtifactRevisionInput = z.infer<typeof createArtifactRevisionInputSchema>;
export type RestoreArtifactRevisionInput = z.infer<typeof restoreArtifactRevisionInputSchema>;
