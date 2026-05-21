import { randomUUID } from "node:crypto";

import {
  createProviderCredentialInputSchema,
  type CreateProviderCredentialInput,
  type ProviderCredential
} from "@agenthub/contracts";

import {
  decryptCredentialSecret,
  encryptCredentialSecret
} from "./credential-encryption.js";
import type {
  CredentialRepository,
  CredentialValidator
} from "./credential-types.js";

export class CredentialService {
  constructor(
    private readonly repository: CredentialRepository,
    private readonly validator: CredentialValidator,
    private readonly encryptionKey: string
  ) {}

  async create(input: CreateProviderCredentialInput): Promise<ProviderCredential> {
    const parsed = createProviderCredentialInputSchema.parse(input);
    const validation = await this.validate(parsed);

    const credential: ProviderCredential = {
      credentialSource: parsed.credentialSource,
      encryptedSecret: encryptCredentialSecret(parsed.rawSecret, this.encryptionKey),
      id: randomUUID(),
      label: parsed.label,
      provider: parsed.provider,
      providerAccountId: validation.providerAccountId,
      validationState: validation.valid ? "valid" : "invalid",
      workspaceId: parsed.workspaceId
    };

    return this.repository.create(credential);
  }

  async validate(
    input: CreateProviderCredentialInput
  ): Promise<Awaited<ReturnType<CredentialValidator>>> {
    const parsed = createProviderCredentialInputSchema.parse(input);
    return this.validator(parsed);
  }

  async list(workspaceId: string): Promise<ProviderCredential[]> {
    return this.repository.listByWorkspace(workspaceId);
  }

  async revoke(id: string, workspaceId: string): Promise<boolean> {
    return this.repository.revoke(id, workspaceId);
  }

  async revealSecret(id: string): Promise<string | null> {
    const credential = await this.repository.findById(id);
    if (!credential) {
      return null;
    }

    return decryptCredentialSecret(credential.encryptedSecret, this.encryptionKey);
  }
}
