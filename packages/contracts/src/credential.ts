import { z } from "zod";

import { userIdSchema } from "./conversation.js";
import { credentialSourceSchema } from "./database-enums.js";
export const providerCredentialSchema = z.object({
  id: z.string().min(1),
  credentialSource: credentialSourceSchema.default("user_provided"),
  encryptedSecret: z.string().min(1),
  label: z.string().min(1),
  ownerUserId: userIdSchema,
  provider: z.enum(["claude-code", "codex", "deepseek", "hermes", "openclaw"]),
  providerAccountId: z.string().min(1),
  validationState: z.enum(["invalid", "pending", "valid"]).default("pending"),
  workspaceId: z.string().min(1).default("default-workspace")
});

export const createProviderCredentialInputSchema = z.object({
  credentialSource: credentialSourceSchema.default("user_provided"),
  label: z.string().trim().min(1).max(100),
  provider: z.enum(["claude-code", "codex", "deepseek", "hermes", "openclaw"]),
  providerAccountId: z.string().trim().min(1),
  rawSecret: z.string().trim().min(1),
  workspaceId: z.string().min(1).default("default-workspace")
});

export type CreateProviderCredentialInput = z.infer<
  typeof createProviderCredentialInputSchema
>;
export type ProviderCredential = z.infer<typeof providerCredentialSchema>;

export const modelConnectionKindSchema = z.enum(["deepseek_api"]);

export const modelConnectionStatusSchema = z.enum([
  "invalid",
  "pending",
  "valid"
]);

export const modelConnectionPresetSchema = z.enum([
  "balanced",
  "fast",
  "powerful"
]);

export const modelConnectionSchema = z.object({
  id: z.string().min(1),
  kind: modelConnectionKindSchema,
  label: z.string().min(1),
  model: z.string().min(1),
  preset: modelConnectionPresetSchema,
  status: modelConnectionStatusSchema,
  workspaceId: z.string().min(1)
});

export const createModelConnectionInputSchema = z.object({
  apiKey: z.string().trim().min(1),
  label: z.string().trim().min(1).max(100),
  model: z.string().trim().min(1).default("deepseek-chat"),
  preset: modelConnectionPresetSchema.default("balanced"),
  workspaceId: z.string().min(1).default("default-workspace")
});

export const validateModelConnectionInputSchema = createModelConnectionInputSchema;

export type CreateModelConnectionInput = z.infer<typeof createModelConnectionInputSchema>;
export type ModelConnection = z.infer<typeof modelConnectionSchema>;
export type ModelConnectionPreset = z.infer<typeof modelConnectionPresetSchema>;
