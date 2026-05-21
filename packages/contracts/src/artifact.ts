import { z } from "zod";

import { artifactKindSchema } from "./database-enums.js";

export const artifactSchema = z.object({
  id: z.string().min(1),
  kind: artifactKindSchema,
  messageId: z.string().min(1),
  title: z.string().min(1),
  mimeType: z.string().min(1),
  previewUrl: z.string().url().nullable().default(null),
  storageKey: z.string().min(1).nullable().default(null),
  workspaceId: z.string().min(1).default("default-workspace")
});

export type Artifact = z.infer<typeof artifactSchema>;
