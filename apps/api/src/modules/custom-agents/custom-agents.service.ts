import { randomUUID } from "node:crypto";

import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import { sql } from "drizzle-orm";
import { DatabaseError } from "pg";

import {
  createCustomAgentInputSchema,
  customAgentSchema,
  type CustomAgent
} from "@agenthub/contracts";

import {
  DatabaseService,
  type DatabaseExecutor
} from "../database/database.service.js";

type ParsedCustomAgentInput = ReturnType<typeof createCustomAgentInputSchema.parse>;

type CustomAgentRow = {
  avatar_url: string | null;
  capability_tags: string[];
  id: string;
  name: string;
  owner_user_id: string;
  provider: CustomAgent["provider"];
  model_profile_id: string | null;
  memory_mode: CustomAgent["memoryMode"];
  approval_mode: CustomAgent["approvalMode"];
  output_style: string;
  scope_description: string | null;
  system_prompt: string;
  tool_bindings: CustomAgent["toolBindings"];
  workspace_id: string;
};

type CredentialBindingRow = {
  id: string;
  provider: CustomAgent["provider"];
  validation_state: "invalid" | "pending" | "valid";
};

@Injectable()
export class CustomAgentsService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async create(
    input: unknown,
    ownerUserId: string,
    executor?: DatabaseExecutor
  ): Promise<CustomAgent> {
    const parsed = createCustomAgentInputSchema.parse(input);
    const db = executor ?? this.database;
    await this.assertUsableModelConnection(parsed, ownerUserId, db);
    const occupiedNames = await this.listWorkspaceAgentNames(
      parsed.workspaceId,
      ownerUserId,
      db
    );

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const name = resolveAvailableCustomAgentName(parsed.name, occupiedNames);

      try {
        return await this.insertCustomAgent({ ...parsed, name }, ownerUserId, db);
      } catch (error) {
        if (isDuplicateCustomAgentNameError(error)) {
          occupiedNames.push(name);
          continue;
        }

        throw error;
      }
    }

    const fallbackName = resolveAvailableCustomAgentName(parsed.name, [
      ...occupiedNames,
      `${parsed.name}${Date.now()}`
    ]);

    return this.insertCustomAgent({ ...parsed, name: fallbackName }, ownerUserId, db);
  }

  async list(workspaceId: string, ownerUserId: string): Promise<CustomAgent[]> {
    const result = await this.database.execute<CustomAgentRow>(sql`
      SELECT
        avatar_url,
        capability_tags,
        id,
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
      FROM custom_agents
      WHERE workspace_id = ${workspaceId}
        AND owner_user_id = ${ownerUserId}
      ORDER BY created_at DESC, id DESC
    `);

    return result.rows.map(mapCustomAgentRow);
  }

  private async insertCustomAgent(
    parsed: ParsedCustomAgentInput,
    ownerUserId: string,
    executor: DatabaseExecutor
  ): Promise<CustomAgent> {
    const result = await executor.execute<CustomAgentRow>(sql`
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
          ${parsed.avatarUrl ?? null},
          ${JSON.stringify(parsed.capabilityTags)}::jsonb,
          ${parsed.name},
          ${ownerUserId},
          ${parsed.provider},
          ${parsed.modelProfileId ?? null},
          ${parsed.memoryMode},
          ${parsed.approvalMode},
          ${parsed.outputStyle},
          ${parsed.scopeDescription ?? null},
          ${parsed.systemPrompt},
          ${JSON.stringify(parsed.toolBindings)}::jsonb,
          ${parsed.workspaceId}
        )
        RETURNING
          avatar_url,
          capability_tags,
          id,
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
      `);

    return mapCustomAgentRow(result.rows[0]);
  }

  private async listWorkspaceAgentNames(
    workspaceId: string,
    ownerUserId: string,
    executor: DatabaseExecutor
  ): Promise<string[]> {
    const result = await executor.execute<{ name: string }>(sql`
      SELECT name
      FROM custom_agents
      WHERE workspace_id = ${workspaceId}
        AND owner_user_id = ${ownerUserId}
    `);

    return result.rows.map((row) => row.name);
  }

  private async assertUsableModelConnection(
    input: ReturnType<typeof createCustomAgentInputSchema.parse>,
    ownerUserId: string,
    executor?: DatabaseExecutor
  ): Promise<void> {
    if (input.provider === "mock") {
      return;
    }

    if (!input.modelProfileId) {
      throw new BadRequestException("请先选择已验证的模型连接。");
    }

    const result = await (executor ?? this.database).execute<CredentialBindingRow>(sql`
      SELECT id, provider, validation_state
      FROM provider_credentials
      WHERE id = ${input.modelProfileId}
        AND owner_user_id = ${ownerUserId}
        AND workspace_id = ${input.workspaceId}
      LIMIT 1
    `);
    const credential = result.rows[0] ?? null;

    if (!credential || credential.validation_state !== "valid") {
      throw new BadRequestException("请选择一个已验证且可用的模型连接。");
    }

    if (!isCredentialCompatibleWithAgentProvider(credential.provider, input.provider)) {
      throw new BadRequestException("所选模型连接与 Agent 运行方式不匹配。");
    }
  }
}

function isCredentialCompatibleWithAgentProvider(
  credentialProvider: CustomAgent["provider"],
  agentProvider: CustomAgent["provider"]
): boolean {
  if (agentProvider === "opencode") {
    return credentialProvider === "opencode" || credentialProvider === "deepseek";
  }

  return credentialProvider === agentProvider;
}

function resolveAvailableCustomAgentName(
  requestedName: string,
  occupiedNames: string[]
): string {
  const maxNameLength = 80;
  const baseName = requestedName.trim();
  const occupiedNameSet = new Set(
    occupiedNames.map((name) => name.trim()).filter((name) => name.length > 0)
  );

  if (!occupiedNameSet.has(baseName)) {
    return baseName;
  }

  for (let suffix = 1; suffix <= 999; suffix += 1) {
    const suffixText = String(suffix);
    const candidate = `${baseName.slice(0, maxNameLength - suffixText.length)}${suffixText}`;

    if (!occupiedNameSet.has(candidate)) {
      return candidate;
    }
  }

  const fallbackSuffix = String(Date.now());
  return `${baseName.slice(0, maxNameLength - fallbackSuffix.length)}${fallbackSuffix}`;
}

function isDuplicateCustomAgentNameError(error: unknown): boolean {
  return (
    error instanceof DatabaseError &&
    error.code === "23505" &&
    error.constraint === "custom_agents_owner_workspace_name_key"
  );
}

function mapCustomAgentRow(row: CustomAgentRow | undefined): CustomAgent {
  if (!row) {
    throw new Error("Custom agent row not found");
  }

  return customAgentSchema.parse({
    avatarUrl: row.avatar_url,
    capabilityTags: row.capability_tags ?? [],
    id: row.id,
    name: row.name,
    ownerUserId: row.owner_user_id,
    provider: row.provider,
    modelProfileId: row.model_profile_id,
    memoryMode: row.memory_mode,
    approvalMode: row.approval_mode,
    outputStyle: row.output_style,
    scopeDescription: row.scope_description,
    systemPrompt: row.system_prompt,
    toolBindings: row.tool_bindings ?? [],
    workspaceId: row.workspace_id
  });
}
