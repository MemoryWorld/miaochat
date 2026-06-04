import { z } from "zod";

import { artifactKindSchema } from "./database-enums.js";
import { workspaceIdSchema } from "./conversation.js";
import { messageIdSchema } from "./message.js";

export const runtimeMarkdownArtifactMaxMarkdownChars = 64 * 1024;
export const runtimeMarkdownArtifactToolName = "artifact.markdown.create" as const;
export const runtimeDiffArtifactMaxPatchChars = 128 * 1024;

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

export const artifactMarkdownCreateToolInputSchema = z.object({
  fileName: z.string().trim().min(1).max(160).optional(),
  markdown: z.string()
    .min(1)
    .max(runtimeMarkdownArtifactMaxMarkdownChars)
    .refine((value) => value.trim().length > 0, {
      message: "Markdown content cannot be blank."
    }),
  title: z.string().trim().min(1).max(120)
});

export const runtimeMarkdownArtifactDraftSchema = z.object({
  fileName: z.string().trim().min(1).max(160).regex(/\.md$/i),
  markdown: z.string()
    .min(1)
    .max(runtimeMarkdownArtifactMaxMarkdownChars)
    .refine((value) => value.trim().length > 0, {
      message: "Markdown content cannot be blank."
    }),
  mimeType: z.literal("text/markdown").default("text/markdown"),
  title: z.string().trim().min(1).max(120),
  type: z.literal("markdown")
});

export const runtimeDiffArtifactDraftSchema = z.object({
  fileName: z.string().trim().min(1).max(160).regex(/\.diff$/i),
  mimeType: z.literal("text/x-diff").default("text/x-diff"),
  patch: z.string()
    .min(1)
    .max(runtimeDiffArtifactMaxPatchChars)
    .refine((value) => value.trim().length > 0, {
      message: "Diff patch cannot be blank."
    }),
  title: z.string().trim().min(1).max(120),
  truncated: z.boolean().default(false),
  type: z.literal("diff")
});

export const runtimeArtifactDraftSchema = z.discriminatedUnion("type", [
  runtimeMarkdownArtifactDraftSchema,
  runtimeDiffArtifactDraftSchema
]);

export const runtimeArtifactStatusSchema = z.object({
  artifactId: z.string().min(1).optional(),
  error: z.string().trim().min(1).max(500).optional(),
  messageId: messageIdSchema,
  previewUrl: z.string().url().optional(),
  status: z.enum(["creating", "created", "failed"]),
  title: z.string().trim().min(1).max(120),
  type: z.enum(["diff", "markdown"])
});

export type Artifact = z.infer<typeof artifactSchema>;
export type ArtifactQuery = z.infer<typeof artifactQuerySchema>;
export type ArtifactUploadTarget = z.infer<typeof artifactUploadTargetSchema>;
export type ArtifactMarkdownCreateToolInput = z.infer<
  typeof artifactMarkdownCreateToolInputSchema
>;
export type CreateArtifactInput = z.infer<typeof createArtifactInputSchema>;
export type PrepareArtifactUploadInput = z.infer<typeof prepareArtifactUploadInputSchema>;
export type RuntimeArtifactDraft = z.infer<typeof runtimeArtifactDraftSchema>;
export type RuntimeArtifactStatus = z.infer<typeof runtimeArtifactStatusSchema>;
export type RuntimeMarkdownArtifactDraft = z.infer<
  typeof runtimeMarkdownArtifactDraftSchema
>;
export type RuntimeDiffArtifactDraft = z.infer<typeof runtimeDiffArtifactDraftSchema>;
