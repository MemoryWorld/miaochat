import { z } from "zod";

import { workspaceIdSchema } from "./conversation.js";

const pooledProviderSchema = z.enum([
  "claude-code",
  "codex",
  "deepseek",
  "hermes",
  "opencode",
  "openclaw"
]);

const poolDimensionSchema = z.string().trim().min(1).max(64);

export const credentialPoolKeySchema = z.object({
  provider: pooledProviderSchema,
  quotaClass: poolDimensionSchema,
  region: poolDimensionSchema,
  tier: poolDimensionSchema
});

export const credentialPoolEntrySchema = credentialPoolKeySchema.extend({
  createdAt: z.coerce.date(),
  credentialSource: z.literal("platform_managed").default("platform_managed"),
  encryptedSecret: z.string().min(1),
  id: z.string().min(1),
  isActive: z.boolean().default(true),
  label: z.string().min(1).max(100),
  providerAccountId: z.string().min(1),
  updatedAt: z.coerce.date()
});

export const createCredentialPoolEntryInputSchema = credentialPoolKeySchema.extend({
  isActive: z.boolean().optional().default(true),
  label: z.string().trim().min(1).max(100),
  providerAccountId: z.string().trim().min(1),
  rawSecret: z.string().trim().min(1)
});

export const credentialPoolSelectionInputSchema = credentialPoolKeySchema.extend({
  workspaceId: workspaceIdSchema
});

export const credentialPoolSelectionSchema = z.object({
  candidateCount: z.number().int().positive(),
  entry: credentialPoolEntrySchema,
  selectionIndex: z.number().int().nonnegative(),
  selectionKey: z.string().min(1)
});

export type CredentialPoolEntry = z.infer<typeof credentialPoolEntrySchema>;
export type CredentialPoolKey = z.infer<typeof credentialPoolKeySchema>;
export type CreateCredentialPoolEntryInput = z.infer<
  typeof createCredentialPoolEntryInputSchema
>;
export type CredentialPoolSelectionInput = z.infer<
  typeof credentialPoolSelectionInputSchema
>;
export type CredentialPoolSelection = z.infer<typeof credentialPoolSelectionSchema>;
