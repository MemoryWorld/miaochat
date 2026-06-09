import type {
  CreateProviderCredentialInput,
  ProviderCredential
} from "@agenthub/contracts";
import {
  credentialSourceSchema,
  createModelConnectionInputSchema,
  createProviderCredentialInputSchema,
  modelConnectionSchema,
  providerCredentialSchema
} from "@agenthub/contracts";
import { z } from "zod";

export const credentialMetadataSchema = providerCredentialSchema.omit({
  encryptedSecret: true
});

export const credentialIdParamsSchema = z.object({
  credentialId: z.string().trim().min(1)
});

export const workspaceQuerySchema = z.object({
  workspaceId: z.string().trim().min(1).default("default-workspace")
});

const credentialModeProviderSchema = z.enum([
  "claude-code",
  "codex",
  "deepseek",
  "hermes",
  "opencode",
  "openclaw"
]);

export const credentialModeSchema = z.object({
  credentialSource: credentialSourceSchema,
  provider: credentialModeProviderSchema,
  workspaceId: z.string().trim().min(1)
});

export const credentialModeInputSchema = z.object({
  credentialSource: credentialSourceSchema.default("user_provided"),
  provider: credentialModeProviderSchema,
  workspaceId: z.string().trim().min(1).default("default-workspace")
});

export type CredentialCreateInput = CreateProviderCredentialInput;
export type CredentialIdParams = z.infer<typeof credentialIdParamsSchema>;
export type CredentialMode = z.infer<typeof credentialModeSchema>;
export type CredentialModeInput = z.infer<typeof credentialModeInputSchema>;
export type CredentialMetadata = z.infer<typeof credentialMetadataSchema>;
export type ModelConnectionMetadata = z.infer<typeof modelConnectionSchema>;
export type WorkspaceQuery = z.infer<typeof workspaceQuerySchema>;

export type CredentialValidationResponse = {
  message?: string;
  providerAccountId: string;
  valid: boolean;
};

export type RevokeCredentialResponse = {
  deleted: boolean;
  id: string;
  workspaceId: string;
};

export function parseCredentialCreateInput(input: unknown): CredentialCreateInput {
  return createProviderCredentialInputSchema.parse(input);
}

export function parseModelConnectionInput(input: unknown) {
  return createModelConnectionInputSchema.parse(input);
}

export function parseCredentialIdParams(input: unknown): CredentialIdParams {
  return credentialIdParamsSchema.parse(input);
}

export function parseCredentialModeInput(input: unknown): CredentialModeInput {
  return credentialModeInputSchema.parse(input);
}

export function parseWorkspaceQuery(input: unknown): WorkspaceQuery {
  return workspaceQuerySchema.parse(input);
}

export function toCredentialMetadata(
  credential: ProviderCredential
): CredentialMetadata {
  return credentialMetadataSchema.parse({
    credentialSource: credential.credentialSource,
    id: credential.id,
    label: credential.label,
    ownerUserId: credential.ownerUserId,
    provider: credential.provider,
    providerAccountId: credential.providerAccountId,
    validationState: credential.validationState,
    workspaceId: credential.workspaceId
  });
}

export function toModelConnectionMetadata(
  credential: CredentialMetadata,
  preset: ModelConnectionMetadata["preset"]
): ModelConnectionMetadata {
  return modelConnectionSchema.parse({
    id: credential.id,
    kind: credential.provider === "opencode" ? "opencode_model" : "deepseek_api",
    label: credential.label,
    model: credential.providerAccountId,
    preset,
    status: credential.validationState,
    workspaceId: credential.workspaceId
  });
}
