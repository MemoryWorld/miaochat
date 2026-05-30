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

import { ChannelMembersService } from "../channels/channel-members.service.js";
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
    @Inject(ChannelMembersService)
    private readonly channelMembersService: ChannelMembersService,
    @Inject(StorageService) private readonly storageService: StorageService
  ) {}

  async create(input: unknown, actorUserId: string): Promise<Artifact> {
    const parsed = createArtifactInputSchema.parse(input);
    const workspaceId = parsed.workspaceId ?? "default-workspace";

    await this.assertMessageAccess({
      actorUserId,
      messageId: parsed.messageId,
      mode: "send",
      workspaceId
    });

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

  async list(input: unknown, actorUserId: string): Promise<Artifact[]> {
    const parsed = artifactQuerySchema.parse(input);
    const access = await this.assertMessageAccess({
      actorUserId,
      messageId: parsed.messageId,
      mode: "read",
      workspaceId: parsed.workspaceId
    });
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
        AND messages.owner_user_id = ${access.ownerUserId}
      ORDER BY artifacts.created_at ASC, artifacts.id ASC
    `);

    return result.rows.map(mapArtifactRow);
  }

  async prepareUploadTarget(
    input: unknown,
    actorUserId: string
  ): Promise<ArtifactUploadTarget> {
    const parsed = prepareArtifactUploadInputSchema.parse(input);
    const workspaceId = parsed.workspaceId ?? "default-workspace";

    await this.assertMessageAccess({
      actorUserId,
      messageId: parsed.messageId,
      mode: "send",
      workspaceId
    });

    return this.storageService.prepareArtifactUpload({
      ...parsed,
      workspaceId
    });
  }

  private async assertMessageAccess(input: {
    actorUserId: string;
    messageId: string;
    mode: "read" | "send";
    workspaceId: string;
  }): Promise<{ ownerUserId: string }> {
    const result = await this.database.execute<{
      conversation_id: string;
      owner_user_id: string;
    }>(sql`
      SELECT conversation_id, owner_user_id
      FROM messages
      WHERE id = ${input.messageId}
        AND workspace_id = ${input.workspaceId}
      LIMIT 1
    `);
    const message = result.rows[0];

    if (!message) {
      throw new NotFoundException(
        `Message ${input.messageId} was not found in workspace ${input.workspaceId}`
      );
    }

    const access =
      input.mode === "send"
        ? await this.channelMembersService.assertCanSend({
            actorUserId: input.actorUserId,
            channelId: message.conversation_id,
            workspaceId: input.workspaceId
          })
        : await this.channelMembersService.assertCanRead({
            actorUserId: input.actorUserId,
            channelId: message.conversation_id,
            workspaceId: input.workspaceId
          });

    return { ownerUserId: access.ownerUserId };
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
