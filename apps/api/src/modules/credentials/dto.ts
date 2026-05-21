import type {
  CreateProviderCredentialInput,
  ProviderCredential
} from "@agenthub/contracts";
import {
  createProviderCredentialInputSchema,
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

export type CredentialCreateInput = CreateProviderCredentialInput;
export type CredentialIdParams = z.infer<typeof credentialIdParamsSchema>;
export type CredentialMetadata = z.infer<typeof credentialMetadataSchema>;
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

export function parseCredentialIdParams(input: unknown): CredentialIdParams {
  return credentialIdParamsSchema.parse(input);
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
    provider: credential.provider,
    providerAccountId: credential.providerAccountId,
    validationState: credential.validationState,
    workspaceId: credential.workspaceId
  });
}
