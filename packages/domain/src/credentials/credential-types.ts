import type {
  CreateProviderCredentialInput,
  ProviderCredential
} from "@agenthub/contracts";

export type CredentialRepository = {
  create(credential: ProviderCredential): Promise<ProviderCredential>;
  findById(id: string): Promise<ProviderCredential | null>;
  listByWorkspace(workspaceId: string): Promise<ProviderCredential[]>;
  revoke(id: string, workspaceId: string): Promise<boolean>;
};

export type CredentialValidationResult = {
  message?: string;
  providerAccountId: string;
  valid: boolean;
};

export type CredentialValidator = (
  input: CreateProviderCredentialInput
) => Promise<CredentialValidationResult>;
