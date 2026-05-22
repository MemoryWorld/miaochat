import { z } from "zod";

import { userIdSchema } from "./conversation.js";
import { credentialSourceSchema } from "./database-enums.js";
export const providerCredentialSchema = z.object({
  id: z.string().min(1),
  credentialSource: credentialSourceSchema.default("user_provided"),
  encryptedSecret: z.string().min(1),
  label: z.string().min(1),
  ownerUserId: userIdSchema,
  provider: z.enum(["claude-code", "codex", "hermes", "openclaw"]),
  providerAccountId: z.string().min(1),
  validationState: z.enum(["invalid", "pending", "valid"]).default("pending"),
  workspaceId: z.string().min(1).default("default-workspace")
});

export const createProviderCredentialInputSchema = z.object({
  credentialSource: credentialSourceSchema.default("user_provided"),
  label: z.string().trim().min(1).max(100),
  provider: z.enum(["claude-code", "codex", "hermes", "openclaw"]),
  providerAccountId: z.string().trim().min(1),
  rawSecret: z.string().trim().min(1),
  workspaceId: z.string().min(1).default("default-workspace")
});

export type CreateProviderCredentialInput = z.infer<
  typeof createProviderCredentialInputSchema
>;
export type ProviderCredential = z.infer<typeof providerCredentialSchema>;
