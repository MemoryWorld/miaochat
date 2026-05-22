import { randomUUID } from "node:crypto";

import { ConflictException, Inject, Injectable } from "@nestjs/common";
import { DatabaseError } from "pg";

import { type DeployTarget, deployTargetSchema } from "@agenthub/contracts";
import { encryptCredentialSecret } from "@agenthub/domain";

import { DatabaseService } from "../database/database.service.js";
import type { DeployTargetMetadata } from "./dto.js";
import {
  parseDeployTargetCreateInput,
  toDeployTargetMetadata
} from "./dto.js";

type DeployTargetRow = {
  config: Record<string, unknown> | null;
  created_at: Date;
  credential_source: DeployTarget["credentialSource"];
  encrypted_secret: string | null;
  id: string;
  kind: DeployTarget["kind"];
  name: string;
  owner_user_id: string;
  updated_at: Date;
  workspace_id: string;
};

@Injectable()
export class DeployTargetsService {
  private readonly encryptionKey =
    process.env.CREDENTIAL_ENCRYPTION_KEY ?? "agenthub-dev-credential-key";

  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async create(input: unknown, ownerUserId: string): Promise<DeployTargetMetadata> {
    const parsed = parseDeployTargetCreateInput(input);

    try {
      const result = await this.database.query<DeployTargetRow>(
        `
          INSERT INTO deploy_targets (
            id,
            workspace_id,
            owner_user_id,
            name,
            kind,
            credential_source,
            encrypted_secret,
            config
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
          RETURNING
            config,
            created_at,
            credential_source,
            encrypted_secret,
            id,
            kind,
            name,
            owner_user_id,
            updated_at,
            workspace_id
        `,
        [
          randomUUID(),
          parsed.workspaceId ?? "default-workspace",
          ownerUserId,
          parsed.name,
          parsed.kind,
          parsed.credentialSource,
          parsed.rawSecret
            ? encryptCredentialSecret(parsed.rawSecret, this.encryptionKey)
            : null,
          JSON.stringify(parsed.config)
        ]
      );

      return toDeployTargetMetadata(mapDeployTargetRow(result.rows[0]));
    } catch (error) {
      if (
        error instanceof DatabaseError &&
        error.code === "23505" &&
        error.constraint === "deploy_targets_owner_workspace_name_key"
      ) {
        throw new ConflictException(
          `Deploy target name "${parsed.name}" already exists in workspace ${parsed.workspaceId ?? "default-workspace"}`
        );
      }

      throw error;
    }
  }

  async list(workspaceId: string, ownerUserId: string): Promise<DeployTargetMetadata[]> {
    const result = await this.database.query<DeployTargetRow>(
      `
        SELECT
          config,
          created_at,
          credential_source,
          encrypted_secret,
          id,
          kind,
          name,
          owner_user_id,
          updated_at,
          workspace_id
        FROM deploy_targets
        WHERE workspace_id = $1 AND owner_user_id = $2
        ORDER BY created_at ASC, id ASC
      `,
      [workspaceId, ownerUserId]
    );

    return result.rows.map((row) => toDeployTargetMetadata(mapDeployTargetRow(row)));
  }
}

function mapDeployTargetRow(row: DeployTargetRow | undefined): DeployTarget {
  if (!row) {
    throw new Error("Deploy target row not found");
  }

  return deployTargetSchema.parse({
    config: row.config ?? {},
    createdAt: row.created_at,
    credentialSource: row.credential_source,
    encryptedSecret: row.encrypted_secret,
    id: row.id,
    kind: row.kind,
    name: row.name,
    ownerUserId: row.owner_user_id,
    updatedAt: row.updated_at,
    workspaceId: row.workspace_id
  });
}
