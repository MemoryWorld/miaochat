import { z } from "zod";

import { artifactKindSchema } from "./database-enums.js";
import { conversationIdSchema, workspaceIdSchema } from "./conversation.js";
import { messageIdSchema } from "./message.js";

export const runtimeMarkdownArtifactMaxMarkdownChars = 64 * 1024;
export const runtimeMarkdownArtifactToolName = "artifact.markdown.create" as const;
export const runtimeDiffArtifactMaxPatchChars = 128 * 1024;
export const runtimeDiffArtifactToolName = "artifact.diff.create" as const;
export const runtimeWebpageArtifactMaxHtmlChars = 256 * 1024;
export const runtimeWebpageArtifactToolName = "artifact.webpage.create" as const;

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
  conversationId: conversationIdSchema.optional(),
  messageId: messageIdSchema.optional(),
  workspaceId: workspaceIdSchema
});

export const artifactReadQuerySchema = z.object({
  artifactId: z.string().min(1),
  workspaceId: workspaceIdSchema
});

export const artifactTextContentSchema = z.object({
  artifactId: z.string().min(1),
  content: z.string(),
  mimeType: z.string().min(1),
  title: z.string().min(1),
  truncated: z.boolean()
});

export const artifactDownloadUrlSchema = z.object({
  downloadUrl: z.string().url()
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

export const artifactWebpageCreateToolInputSchema = z.object({
  fileName: z.string().trim().min(1).max(160).optional(),
  html: z.string()
    .min(1)
    .max(runtimeWebpageArtifactMaxHtmlChars)
    .refine((value) => value.trim().length > 0, {
      message: "HTML content cannot be blank."
    }),
  title: z.string().trim().min(1).max(120)
});

export const artifactDiffCreateToolInputSchema = z.object({
  fileName: z.string().trim().min(1).max(160).optional(),
  patch: z.string()
    .min(1)
    .max(runtimeDiffArtifactMaxPatchChars)
    .refine((value) => value.trim().length > 0, {
      message: "Diff patch cannot be blank."
    }),
  title: z.string().trim().min(1).max(120),
  truncated: z.boolean().default(false)
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

export const runtimeWebpageArtifactDraftSchema = z.object({
  fileName: z.string().trim().min(1).max(160).regex(/\.html$/i),
  html: z.string()
    .min(1)
    .max(runtimeWebpageArtifactMaxHtmlChars)
    .refine((value) => value.trim().length > 0, {
      message: "HTML content cannot be blank."
    }),
  mimeType: z.literal("text/html").default("text/html"),
  title: z.string().trim().min(1).max(120),
  type: z.literal("webpage")
});

export const runtimeArtifactDraftSchema = z.discriminatedUnion("type", [
  runtimeMarkdownArtifactDraftSchema,
  runtimeDiffArtifactDraftSchema,
  runtimeWebpageArtifactDraftSchema
]);

export const runtimeArtifactStatusSchema = z.object({
  artifactId: z.string().min(1).optional(),
  error: z.string().trim().min(1).max(500).optional(),
  messageId: messageIdSchema,
  previewUrl: z.string().url().optional(),
  status: z.enum(["creating", "created", "failed"]),
  title: z.string().trim().min(1).max(120),
  type: z.enum(["diff", "markdown", "webpage"])
});

export type Artifact = z.infer<typeof artifactSchema>;
export type ArtifactDownloadUrl = z.infer<typeof artifactDownloadUrlSchema>;
export type ArtifactQuery = z.infer<typeof artifactQuerySchema>;
export type ArtifactReadQuery = z.infer<typeof artifactReadQuerySchema>;
export type ArtifactTextContent = z.infer<typeof artifactTextContentSchema>;
export type ArtifactUploadTarget = z.infer<typeof artifactUploadTargetSchema>;
export type ArtifactMarkdownCreateToolInput = z.infer<
  typeof artifactMarkdownCreateToolInputSchema
>;
export type ArtifactDiffCreateToolInput = z.infer<
  typeof artifactDiffCreateToolInputSchema
>;
export type ArtifactWebpageCreateToolInput = z.infer<
  typeof artifactWebpageCreateToolInputSchema
>;
export type CreateArtifactInput = z.infer<typeof createArtifactInputSchema>;
export type PrepareArtifactUploadInput = z.infer<typeof prepareArtifactUploadInputSchema>;
export type RuntimeArtifactDraft = z.infer<typeof runtimeArtifactDraftSchema>;
export type RuntimeArtifactStatus = z.infer<typeof runtimeArtifactStatusSchema>;
export type RuntimeMarkdownArtifactDraft = z.infer<
  typeof runtimeMarkdownArtifactDraftSchema
>;
export type RuntimeDiffArtifactDraft = z.infer<typeof runtimeDiffArtifactDraftSchema>;
export type RuntimeWebpageArtifactDraft = z.infer<typeof runtimeWebpageArtifactDraftSchema>;
