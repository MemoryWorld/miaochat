import { randomUUID } from "node:crypto";

import { ConflictException, Inject, Injectable } from "@nestjs/common";
import { sql } from "drizzle-orm";
import { DatabaseError } from "pg";

import {
  createCustomAgentInputSchema,
  customAgentSchema,
  type CustomAgent
} from "@agenthub/contracts";

import { DatabaseService } from "../database/database.service.js";

type CustomAgentRow = {
  avatar_url: string | null;
  capability_tags: string[];
  id: string;
  name: string;
  owner_user_id: string;
  provider: CustomAgent["provider"];
  system_prompt: string;
  tool_bindings: CustomAgent["toolBindings"];
  workspace_id: string;
};

@Injectable()
export class CustomAgentsService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async create(input: unknown, ownerUserId: string): Promise<CustomAgent> {
    const parsed = createCustomAgentInputSchema.parse(input);

    try {
      const result = await this.database.execute<CustomAgentRow>(sql`
        INSERT INTO custom_agents (
          id,
          avatar_url,
          capability_tags,
          name,
          owner_user_id,
          provider,
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
          system_prompt,
          tool_bindings,
          workspace_id
      `);

      return mapCustomAgentRow(result.rows[0]);
    } catch (error) {
      if (
        error instanceof DatabaseError &&
        error.code === "23505" &&
        error.constraint === "custom_agents_owner_workspace_name_key"
      ) {
        throw new ConflictException(
          `Custom agent name "${parsed.name}" already exists in workspace ${parsed.workspaceId}`
        );
      }

      throw error;
    }
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
    systemPrompt: row.system_prompt,
    toolBindings: row.tool_bindings ?? [],
    workspaceId: row.workspace_id
  });
}
