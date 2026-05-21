import { randomUUID } from "node:crypto";

import { Inject, Injectable, NotFoundException } from "@nestjs/common";
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

  async create(input: unknown): Promise<Artifact> {
    const parsed = createArtifactInputSchema.parse(input);
    const workspaceId = parsed.workspaceId ?? "default-workspace";

    await this.assertMessageExists(parsed.messageId, workspaceId);

    try {
      const result = await this.database.query<ArtifactRow>(
        `
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
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
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
        `,
        [
          parsed.id ?? randomUUID(),
          parsed.kind,
          parsed.messageId,
          parsed.mimeType,
          parsed.previewUrl ?? null,
          parsed.storageKey ?? null,
          parsed.title,
          workspaceId
        ]
      );

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

  async list(input: unknown): Promise<Artifact[]> {
    const parsed = artifactQuerySchema.parse(input);
    const result = await this.database.query<ArtifactRow>(
      `
        SELECT
          created_at,
          id,
          kind,
          message_id,
          mime_type,
          preview_url,
          storage_key,
          title,
          workspace_id
        FROM artifacts
        WHERE message_id = $1 AND workspace_id = $2
        ORDER BY created_at ASC, id ASC
      `,
      [parsed.messageId, parsed.workspaceId]
    );

    return result.rows.map(mapArtifactRow);
  }

  async prepareUploadTarget(input: unknown): Promise<ArtifactUploadTarget> {
    const parsed = prepareArtifactUploadInputSchema.parse(input);
    const workspaceId = parsed.workspaceId ?? "default-workspace";

    await this.assertMessageExists(parsed.messageId, workspaceId);

    return this.storageService.prepareArtifactUpload({
      ...parsed,
      workspaceId
    });
  }

  private async assertMessageExists(
    messageId: string,
    workspaceId: string
  ): Promise<void> {
    const result = await this.database.query<{ id: string }>(
      `
        SELECT id
        FROM messages
        WHERE id = $1 AND workspace_id = $2
      `,
      [messageId, workspaceId]
    );

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
