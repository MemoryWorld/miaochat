import { randomUUID } from "node:crypto";

import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import { sql } from "drizzle-orm";

import type {
  CreateProviderCredentialInput,
  ModelConnectionPreset,
  ProviderId,
  ProviderCredential
} from "@agenthub/contracts";
import { CredentialService, type CredentialRepository } from "@agenthub/domain";

import { DatabaseService } from "../database/database.service.js";
import type {
  CredentialMode,
  CredentialModeInput,
  CredentialMetadata,
  CredentialValidationResponse,
  ModelConnectionMetadata,
  RevokeCredentialResponse
} from "./dto.js";
import {
  credentialModeSchema,
  parseCredentialModeInput,
  parseModelConnectionInput,
  parseCredentialCreateInput,
  toCredentialMetadata,
  toModelConnectionMetadata
} from "./dto.js";
import { QuotaService } from "../quota/quota.service.js";
import { CredentialPoolService } from "./pool.service.js";
import { validateClaudeCodeCredential } from "./providers/claude-code-validator.js";
import { validateCodexCredential } from "./providers/codex-validator.js";
import { validateDeepSeekCredential } from "./providers/deepseek-validator.js";
import { validateHermesCredential } from "./providers/hermes-validator.js";
import { validateOpenCodeCredential } from "./providers/opencode-validator.js";
import { validateOpenClawCredential } from "./providers/openclaw-validator.js";

type CredentialRow = {
  credential_source: ProviderCredential["credentialSource"];
  encrypted_secret: string;
  id: string;
  label: string;
  model_connection_preset: ModelConnectionPreset | null;
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
        model_connection_preset,
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
        model_connection_preset,
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
        model_connection_preset,
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
    await this.upsertAgentContactForCredential(credential);
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

  async createModelConnection(input: unknown, ownerUserId: string): Promise<ModelConnectionMetadata> {
    const parsed = parseModelConnectionInput(input);
    const credential = await this.create(
      {
        label: parsed.label,
        provider: "opencode",
        providerAccountId: parsed.model,
        rawSecret: parsed.apiKey,
        workspaceId: parsed.workspaceId
      },
      ownerUserId
    );

    await this.database.execute(sql`
      UPDATE provider_credentials
      SET model_connection_preset = ${parsed.preset}
      WHERE id = ${credential.id}
        AND owner_user_id = ${ownerUserId}
    `);

    return toModelConnectionMetadata(credential, parsed.preset);
  }

  async validateModelConnection(input: unknown): Promise<CredentialValidationResponse> {
    const parsed = parseModelConnectionInput(input);
    return this.validate({
      label: parsed.label,
      provider: "opencode",
      providerAccountId: parsed.model,
      rawSecret: parsed.apiKey,
      workspaceId: parsed.workspaceId
    });
  }

  async listModelConnections(workspaceId: string, ownerUserId: string): Promise<ModelConnectionMetadata[]> {
    const result = await this.database.execute<CredentialRow>(sql`
      SELECT
        id,
        credential_source,
        encrypted_secret,
        label,
        model_connection_preset,
        owner_user_id,
        provider,
        provider_account_id,
        validation_state,
        workspace_id
      FROM provider_credentials
      WHERE workspace_id = ${workspaceId}
        AND owner_user_id = ${ownerUserId}
        AND provider IN ('deepseek', 'opencode')
      ORDER BY created_at ASC
    `);

    return result.rows.map((row) =>
      toModelConnectionMetadata(
        toCredentialMetadata(mapCredentialRow(row)),
        resolveModelConnectionPreset(row.model_connection_preset)
      )
    );
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
      case "deepseek":
        return validateDeepSeekCredential(input);
      case "hermes":
        return validateHermesCredential(input);
      case "opencode":
        return validateOpenCodeCredential(input);
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

  private async upsertAgentContactForCredential(
    credential: ProviderCredential
  ): Promise<void> {
    const contact = buildAgentContactForCredential(credential);

    if (!contact) {
      return;
    }

    await this.database.execute(sql`
      INSERT INTO custom_agents (
        id,
        avatar_url,
        capability_tags,
        name,
        owner_user_id,
        provider,
        model_profile_id,
        memory_mode,
        approval_mode,
        output_style,
        scope_description,
        system_prompt,
        tool_bindings,
        workspace_id
      )
      VALUES (
        ${randomUUID()},
        null,
        ${JSON.stringify(contact.capabilityTags)}::jsonb,
        ${contact.name},
        ${credential.ownerUserId},
        ${contact.provider},
        ${credential.id},
        'workspace_plus_teammate',
        'balanced',
        '清晰、结构化、先给结论再给步骤。',
        ${contact.scopeDescription},
        ${contact.systemPrompt},
        ${JSON.stringify([])}::jsonb,
        ${credential.workspaceId}
      )
      ON CONFLICT (owner_user_id, workspace_id, name)
      DO UPDATE SET
        capability_tags = EXCLUDED.capability_tags,
        provider = EXCLUDED.provider,
        model_profile_id = EXCLUDED.model_profile_id,
        scope_description = EXCLUDED.scope_description,
        system_prompt = EXCLUDED.system_prompt,
        updated_at = now()
    `);
  }
}

function resolveModelConnectionPreset(
  value: ModelConnectionPreset | string | null
): ModelConnectionPreset {
  if (value === "fast" || value === "powerful" || value === "balanced") {
    return value;
  }

  return "balanced";
}

function buildAgentContactForCredential(credential: ProviderCredential): {
  capabilityTags: string[];
  name: string;
  provider: ProviderId;
  scopeDescription: string;
  systemPrompt: string;
} | null {
  if (credential.validationState !== "valid") {
    return null;
  }

  const runtime = resolveRuntimeKindForCredential(credential);

  if (!runtime) {
    return null;
  }

  const name = resolveAgentContactName(credential);
  const capabilityTags = [
    "platform-runtime-agent",
    `runtime:${runtime}`,
    `model-connection:${credential.id}`,
    "代码",
    "网页",
    "文件产出",
    "通用聊天"
  ];

  if (runtime !== "opencode") {
    capabilityTags.push("评审");
  }

  return {
    capabilityTags,
    name,
    provider: runtime === "claude_code" ? "claude-code" : runtime,
    scopeDescription: buildAgentContactScopeDescription(name, credential),
    systemPrompt: buildAgentContactSystemPrompt(name, runtime)
  };
}

function resolveRuntimeKindForCredential(
  credential: ProviderCredential
): "claude_code" | "codex" | "opencode" | null {
  switch (credential.provider) {
    case "codex":
      return "codex";
    case "claude-code":
      return "claude_code";
    case "deepseek":
    case "opencode":
      return "opencode";
    case "hermes":
    case "openclaw":
      return null;
  }
}

function resolveAgentContactName(credential: ProviderCredential): string {
  if (credential.provider === "codex") {
    return "Codex";
  }

  if (credential.provider === "claude-code") {
    return "Claude Code";
  }

  const vendor = credential.providerAccountId.split("/")[0]?.trim().toLowerCase() ?? "";

  switch (vendor) {
    case "deepseek":
      return "DeepSeek Agent";
    case "qwen":
    case "dashscope":
      return "Qwen Agent";
    case "moonshot":
    case "kimi":
      return "Kimi Agent";
    case "zhipu":
    case "glm":
      return "GLM Agent";
    case "minimax":
      return "MiniMax Agent";
    default:
      return normalizeAgentContactName(credential.label);
  }
}

function normalizeAgentContactName(label: string): string {
  const cleaned = label
    .replace(/（OpenCode）/g, "")
    .replace(/\(OpenCode\)/gi, "")
    .replace(/连接$/u, "")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned.length > 0 ? `${cleaned} Agent` : "OpenCode Agent";
}

function buildAgentContactScopeDescription(
  name: string,
  credential: ProviderCredential
): string {
  if (credential.provider === "codex") {
    return "使用 OpenAI Codex 处理代码、网页和工程任务。";
  }

  if (credential.provider === "claude-code") {
    return "使用 Claude Code 处理代码理解、编辑和交付任务。";
  }

  return `${name} 可处理聊天、代码和网页产物生成任务。`;
}

function buildAgentContactSystemPrompt(
  name: string,
  runtime: "claude_code" | "codex" | "opencode"
): string {
  const runtimeLabel =
    runtime === "codex" ? "Codex" : runtime === "claude_code" ? "Claude Code" : "当前模型";

  return `你是 Miaochat 中的 ${name}，通过 ${runtimeLabel} 处理用户的聊天、代码和网页产物任务。保持回答清晰，只有真实产物生成后才声称已生成文件。`;
}
