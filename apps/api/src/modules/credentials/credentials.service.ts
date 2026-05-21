import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException
} from "@nestjs/common";

import type {
  CreateProviderCredentialInput,
  ProviderCredential
} from "@agenthub/contracts";
import { CredentialService, type CredentialRepository } from "@agenthub/domain";

import { DatabaseService } from "../database/database.service.js";
import type {
  CredentialMetadata,
  CredentialValidationResponse,
  RevokeCredentialResponse
} from "./dto.js";
import {
  parseCredentialCreateInput,
  toCredentialMetadata
} from "./dto.js";
import { validateClaudeCodeCredential } from "./providers/claude-code-validator.js";
import { validateCodexCredential } from "./providers/codex-validator.js";
import { validateHermesCredential } from "./providers/hermes-validator.js";
import { validateOpenClawCredential } from "./providers/openclaw-validator.js";

type CredentialRow = {
  credential_source: ProviderCredential["credentialSource"];
  encrypted_secret: string;
  id: string;
  label: string;
  provider: ProviderCredential["provider"];
  provider_account_id: string;
  validation_state: ProviderCredential["validationState"];
  workspace_id: string;
};

class PostgresCredentialRepository implements CredentialRepository {
  constructor(private readonly database: DatabaseService) {}

  async create(credential: ProviderCredential): Promise<ProviderCredential> {
    const result = await this.database.query<CredentialRow>(
      `
        INSERT INTO provider_credentials (
          id,
          credential_source,
          encrypted_secret,
          label,
          provider,
          provider_account_id,
          validation_state,
          workspace_id
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING
          id,
          credential_source,
          encrypted_secret,
          label,
          provider,
          provider_account_id,
          validation_state,
          workspace_id
      `,
      [
        credential.id,
        credential.credentialSource,
        credential.encryptedSecret,
        credential.label,
        credential.provider,
        credential.providerAccountId,
        credential.validationState,
        credential.workspaceId
      ]
    );

    return mapCredentialRow(result.rows[0]);
  }

  async findById(id: string): Promise<ProviderCredential | null> {
    const result = await this.database.query<CredentialRow>(
      `
        SELECT
          id,
          credential_source,
          encrypted_secret,
          label,
          provider,
          provider_account_id,
          validation_state,
          workspace_id
        FROM provider_credentials
        WHERE id = $1
      `,
      [id]
    );

    return result.rows[0] ? mapCredentialRow(result.rows[0]) : null;
  }

  async listByWorkspace(workspaceId: string): Promise<ProviderCredential[]> {
    const result = await this.database.query<CredentialRow>(
      `
        SELECT
          id,
          credential_source,
          encrypted_secret,
          label,
          provider,
          provider_account_id,
          validation_state,
          workspace_id
        FROM provider_credentials
        WHERE workspace_id = $1
        ORDER BY created_at ASC
      `,
      [workspaceId]
    );

    return result.rows.map(mapCredentialRow);
  }

  async revoke(id: string, workspaceId: string): Promise<boolean> {
    const result = await this.database.query(
      `
        DELETE FROM provider_credentials
        WHERE id = $1 AND workspace_id = $2
      `,
      [id, workspaceId]
    );

    return (result.rowCount ?? 0) > 0;
  }
}

function mapCredentialRow(row: CredentialRow | undefined): ProviderCredential {
  if (!row) {
    throw new Error("Credential row not found");
  }

  return {
    credentialSource: row.credential_source,
    encryptedSecret: row.encrypted_secret,
    id: row.id,
    label: row.label,
    provider: row.provider,
    providerAccountId: row.provider_account_id,
    validationState: row.validation_state,
    workspaceId: row.workspace_id
  };
}

@Injectable()
export class CredentialsService {
  private readonly domainService: CredentialService;

  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {
    const repository = new PostgresCredentialRepository(database);
    this.domainService = new CredentialService(
      repository,
      (input) => this.validateProvider(input),
      process.env.CREDENTIAL_ENCRYPTION_KEY ?? "agenthub-dev-credential-key"
    );
  }

  async create(input: unknown): Promise<CredentialMetadata> {
    const parsed = parseCredentialCreateInput(input);
    const validation = await this.validateProvider(parsed);

    if (!validation.valid) {
      throw new BadRequestException(validation.message ?? "Credential validation failed");
    }

    const credential = await this.domainService.create(parsed);
    return toCredentialMetadata(credential);
  }

  async validate(input: unknown): Promise<CredentialValidationResponse> {
    const parsed = parseCredentialCreateInput(input);
    const validation = await this.domainService.validate(parsed);

    return {
      message: validation.message,
      providerAccountId: validation.providerAccountId,
      valid: validation.valid
    };
  }

  async list(workspaceId: string): Promise<CredentialMetadata[]> {
    const credentials = await this.domainService.list(workspaceId);
    return credentials.map(toCredentialMetadata);
  }

  async revoke(id: string, workspaceId: string): Promise<RevokeCredentialResponse> {
    const deleted = await this.domainService.revoke(id, workspaceId);
    if (!deleted) {
      throw new NotFoundException(`Credential ${id} was not found in workspace ${workspaceId}`);
    }

    return {
      deleted,
      id,
      workspaceId
    };
  }

  private validateProvider(input: CreateProviderCredentialInput) {
    switch (input.provider) {
      case "claude-code":
        return validateClaudeCodeCredential(input);
      case "codex":
        return validateCodexCredential(input);
      case "hermes":
        return validateHermesCredential(input);
      case "openclaw":
        return validateOpenClawCredential(input);
    }
  }
}
