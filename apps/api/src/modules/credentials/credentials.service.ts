import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import { sql } from "drizzle-orm";

import type {
  CreateProviderCredentialInput,
  ProviderCredential
} from "@agenthub/contracts";
import { CredentialService, type CredentialRepository } from "@agenthub/domain";

import { DatabaseService } from "../database/database.service.js";
import type {
  CredentialMode,
  CredentialModeInput,
  CredentialMetadata,
  CredentialValidationResponse,
  RevokeCredentialResponse
} from "./dto.js";
import {
  credentialModeSchema,
  parseCredentialModeInput,
  parseCredentialCreateInput,
  toCredentialMetadata
} from "./dto.js";
import { QuotaService } from "../quota/quota.service.js";
import { CredentialPoolService } from "./pool.service.js";
import { validateClaudeCodeCredential } from "./providers/claude-code-validator.js";
import { validateCodexCredential } from "./providers/codex-validator.js";
import { validateHermesCredential } from "./providers/hermes-validator.js";
import { validateOpenClawCredential } from "./providers/openclaw-validator.js";

type CredentialRow = {
  credential_source: ProviderCredential["credentialSource"];
  encrypted_secret: string;
  id: string;
  label: string;
  owner_user_id: string;
  provider: ProviderCredential["provider"];
  provider_account_id: string;
  validation_state: ProviderCredential["validationState"];
  workspace_id: string;
};

type CredentialModeRow = {
  credential_source: CredentialMode["credentialSource"];
  provider: CredentialMode["provider"];
  workspace_id: string;
};

class PostgresCredentialRepository implements CredentialRepository {
  constructor(private readonly database: DatabaseService) {}

  async create(credential: ProviderCredential): Promise<ProviderCredential> {
    const result = await this.database.execute<CredentialRow>(sql`
      INSERT INTO provider_credentials (
        id,
        credential_source,
        encrypted_secret,
        label,
        owner_user_id,
        provider,
        provider_account_id,
        validation_state,
        workspace_id
      )
      VALUES (
        ${credential.id},
        ${credential.credentialSource},
        ${credential.encryptedSecret},
        ${credential.label},
        ${credential.ownerUserId},
        ${credential.provider},
        ${credential.providerAccountId},
        ${credential.validationState},
        ${credential.workspaceId}
      )
      RETURNING
        id,
        credential_source,
        encrypted_secret,
        label,
        owner_user_id,
        provider,
        provider_account_id,
        validation_state,
        workspace_id
    `);

    return mapCredentialRow(result.rows[0]);
  }

  async findById(id: string, ownerUserId: string): Promise<ProviderCredential | null> {
    const result = await this.database.execute<CredentialRow>(sql`
      SELECT
        id,
        credential_source,
        encrypted_secret,
        label,
        owner_user_id,
        provider,
        provider_account_id,
        validation_state,
        workspace_id
      FROM provider_credentials
      WHERE id = ${id}
        AND owner_user_id = ${ownerUserId}
    `);

    return result.rows[0] ? mapCredentialRow(result.rows[0]) : null;
  }

  async listByWorkspace(workspaceId: string, ownerUserId: string): Promise<ProviderCredential[]> {
    const result = await this.database.execute<CredentialRow>(sql`
      SELECT
        id,
        credential_source,
        encrypted_secret,
        label,
        owner_user_id,
        provider,
        provider_account_id,
        validation_state,
        workspace_id
      FROM provider_credentials
      WHERE workspace_id = ${workspaceId}
        AND owner_user_id = ${ownerUserId}
      ORDER BY created_at ASC
    `);

    return result.rows.map(mapCredentialRow);
  }

  async revoke(id: string, workspaceId: string, ownerUserId: string): Promise<boolean> {
    const result = await this.database.execute(sql`
      DELETE FROM provider_credentials
      WHERE id = ${id}
        AND workspace_id = ${workspaceId}
        AND owner_user_id = ${ownerUserId}
    `);

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
    ownerUserId: row.owner_user_id,
    provider: row.provider,
    providerAccountId: row.provider_account_id,
    validationState: row.validation_state,
    workspaceId: row.workspace_id
  };
}

@Injectable()
export class CredentialsService {
  private readonly domainService: CredentialService;

  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CredentialPoolService) private readonly credentialPool: CredentialPoolService,
    @Inject(QuotaService) private readonly quotaService: QuotaService
  ) {
    const repository = new PostgresCredentialRepository(database);
    this.domainService = new CredentialService(
      repository,
      (input) => this.validateProvider(input),
      process.env.CREDENTIAL_ENCRYPTION_KEY ?? "agenthub-dev-credential-key"
    );
  }

  async create(input: unknown, ownerUserId: string): Promise<CredentialMetadata> {
    const parsed = parseCredentialCreateInput(input);
    const validation = await this.validateProvider(parsed);

    if (!validation.valid) {
      throw new BadRequestException(validation.message ?? "Credential validation failed");
    }

    const credential = await this.domainService.create(parsed, ownerUserId);
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

  async list(workspaceId: string, ownerUserId: string): Promise<CredentialMetadata[]> {
    const credentials = await this.domainService.list(workspaceId, ownerUserId);
    return credentials.map(toCredentialMetadata);
  }

  async listModes(workspaceId: string, ownerUserId: string): Promise<CredentialMode[]> {
    const result = await this.database.execute<CredentialModeRow>(sql`
      SELECT
        credential_source,
        provider,
        workspace_id
      FROM workspace_provider_credential_modes
      WHERE owner_user_id = ${ownerUserId}
        AND workspace_id = ${workspaceId}
      ORDER BY provider ASC
    `);

    return result.rows.map((row) =>
      credentialModeSchema.parse({
        credentialSource: row.credential_source,
        provider: row.provider,
        workspaceId: row.workspace_id
      })
    );
  }

  async setMode(input: unknown, ownerUserId: string): Promise<CredentialMode> {
    const parsed = parseCredentialModeInput(input);

    if (parsed.credentialSource === "user_provided") {
      await this.database.execute(sql`
        DELETE FROM workspace_provider_credential_modes
        WHERE owner_user_id = ${ownerUserId}
          AND workspace_id = ${parsed.workspaceId}
          AND provider = ${parsed.provider}
      `);

      return credentialModeSchema.parse({
        credentialSource: "user_provided",
        provider: parsed.provider,
        workspaceId: parsed.workspaceId
      });
    }

    await this.assertPlatformManagedModeAllowed(parsed);

    const result = await this.database.execute<CredentialModeRow>(sql`
      INSERT INTO workspace_provider_credential_modes (
        owner_user_id,
        workspace_id,
        provider,
        credential_source
      )
      VALUES (
        ${ownerUserId},
        ${parsed.workspaceId},
        ${parsed.provider},
        ${parsed.credentialSource}
      )
      ON CONFLICT (owner_user_id, workspace_id, provider)
      DO UPDATE SET
        credential_source = EXCLUDED.credential_source,
        updated_at = now()
      RETURNING
        credential_source,
        provider,
        workspace_id
    `);

    return credentialModeSchema.parse({
      credentialSource: result.rows[0]?.credential_source,
      provider: result.rows[0]?.provider,
      workspaceId: result.rows[0]?.workspace_id
    });
  }

  async revoke(
    id: string,
    workspaceId: string,
    ownerUserId: string
  ): Promise<RevokeCredentialResponse> {
    const deleted = await this.domainService.revoke(id, workspaceId, ownerUserId);
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

  private async assertPlatformManagedModeAllowed(
    input: CredentialModeInput
  ): Promise<void> {
    const [hasPoolEntries, hasQuotaPolicy] = await Promise.all([
      this.credentialPool.hasEntriesForProvider(input.provider),
      Promise.resolve(this.quotaService.hasPolicy(input.provider))
    ]);

    if (!hasPoolEntries || !hasQuotaPolicy) {
      throw new BadRequestException(
        "Platform-managed mode is not available for this provider in the current policy."
      );
    }
  }
}
