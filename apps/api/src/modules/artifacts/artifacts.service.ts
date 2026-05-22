import { randomUUID } from "node:crypto";

import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { sql } from "drizzle-orm";
import { DatabaseError } from "pg";

import {
  artifactQuerySchema,
  artifactSchema,
  createArtifactInputSchema,
  prepareArtifactUploadInputSchema,
  type Artifact,
  type ArtifactUploadTarget
} from "@agenthub/contracts";

import { DatabaseService } from "../database/database.service.js";
import { StorageService } from "./storage.service.js";

type ArtifactRow = {
  created_at: Date;
  id: string;
  kind: Artifact["kind"];
  message_id: string;
  mime_type: string;
  preview_url: string | null;
  storage_key: string | null;
  title: string;
  workspace_id: string;
};

@Injectable()
export class ArtifactsService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(StorageService) private readonly storageService: StorageService
  ) {}

  async create(input: unknown, ownerUserId: string): Promise<Artifact> {
    const parsed = createArtifactInputSchema.parse(input);
    const workspaceId = parsed.workspaceId ?? "default-workspace";

    await this.assertMessageExists(parsed.messageId, workspaceId, ownerUserId);

    try {
      const result = await this.database.execute<ArtifactRow>(sql`
        INSERT INTO artifacts (
          id,
          kind,
          message_id,
          mime_type,
          preview_url,
          storage_key,
          title,
          workspace_id
        )
        VALUES (
          ${parsed.id ?? randomUUID()},
          ${parsed.kind},
          ${parsed.messageId},
          ${parsed.mimeType},
          ${parsed.previewUrl ?? null},
          ${parsed.storageKey ?? null},
          ${parsed.title},
          ${workspaceId}
        )
        RETURNING
          created_at,
          id,
          kind,
          message_id,
          mime_type,
          preview_url,
          storage_key,
          title,
          workspace_id
      `);

      return mapArtifactRow(result.rows[0]);
    } catch (error) {
      if (error instanceof DatabaseError && error.code === "23503") {
        throw new NotFoundException(
          `Message ${parsed.messageId} was not found in workspace ${workspaceId}`
        );
      }

      throw error;
    }
  }

  async list(input: unknown, ownerUserId: string): Promise<Artifact[]> {
    const parsed = artifactQuerySchema.parse(input);
    const result = await this.database.execute<ArtifactRow>(sql`
      SELECT
        artifacts.created_at,
        artifacts.id,
        artifacts.kind,
        artifacts.message_id,
        artifacts.mime_type,
        artifacts.preview_url,
        artifacts.storage_key,
        artifacts.title,
        artifacts.workspace_id
      FROM artifacts
      INNER JOIN messages
        ON messages.id = artifacts.message_id
        AND messages.workspace_id = artifacts.workspace_id
      WHERE artifacts.message_id = ${parsed.messageId}
        AND artifacts.workspace_id = ${parsed.workspaceId}
        AND messages.owner_user_id = ${ownerUserId}
      ORDER BY artifacts.created_at ASC, artifacts.id ASC
    `);

    return result.rows.map(mapArtifactRow);
  }

  async prepareUploadTarget(
    input: unknown,
    ownerUserId: string
  ): Promise<ArtifactUploadTarget> {
    const parsed = prepareArtifactUploadInputSchema.parse(input);
    const workspaceId = parsed.workspaceId ?? "default-workspace";

    await this.assertMessageExists(parsed.messageId, workspaceId, ownerUserId);

    return this.storageService.prepareArtifactUpload({
      ...parsed,
      workspaceId
    });
  }

  private async assertMessageExists(
    messageId: string,
    workspaceId: string,
    ownerUserId: string
  ): Promise<void> {
    const result = await this.database.execute<{ id: string }>(sql`
      SELECT id
      FROM messages
      WHERE id = ${messageId}
        AND workspace_id = ${workspaceId}
        AND owner_user_id = ${ownerUserId}
    `);

    if (!result.rows[0]) {
      throw new NotFoundException(
        `Message ${messageId} was not found in workspace ${workspaceId}`
      );
    }
  }
}

function mapArtifactRow(row: ArtifactRow | undefined): Artifact {
  if (!row) {
    throw new Error("Artifact row not found");
  }

  return artifactSchema.parse({
    createdAt: row.created_at,
    id: row.id,
    kind: row.kind,
    messageId: row.message_id,
    mimeType: row.mime_type,
    previewUrl: row.preview_url,
    storageKey: row.storage_key,
    title: row.title,
    workspaceId: row.workspace_id
  });
}
