import { randomUUID } from "node:crypto";

import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import { sql } from "drizzle-orm";
import { DatabaseError } from "pg";
import { z } from "zod";

import {
  artifactQuerySchema,
  artifactSchema,
  createArtifactInputSchema,
  messageIdSchema,
  prepareArtifactUploadInputSchema,
  runtimeMarkdownArtifactDraftSchema,
  workspaceIdSchema,
  type Artifact,
  type ArtifactUploadTarget
} from "@agenthub/contracts";

import { ChannelMembersService } from "../channels/channel-members.service.js";
import { DatabaseService } from "../database/database.service.js";
import { StorageService } from "./storage.service.js";

type MessageAccess = {
  ownerUserId: string;
};

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

const createRuntimeMarkdownArtifactInputSchema = z.object({
  draft: runtimeMarkdownArtifactDraftSchema,
  messageId: messageIdSchema,
  workspaceId: workspaceIdSchema.optional()
});

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
    const access = await this.resolveMessageAccess({
      actorUserId,
      hiddenBehavior: "empty",
      messageId: parsed.messageId,
      mode: "read",
      workspaceId: parsed.workspaceId
    });

    if (!access) {
      return [];
    }

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

  async createRuntimeMarkdownArtifact(
    input: unknown,
    actorUserId: string
  ): Promise<Artifact> {
    const parsed = createRuntimeMarkdownArtifactInputSchema.parse(input);
    const workspaceId = parsed.workspaceId ?? "default-workspace";

    await this.assertMessageAccess({
      actorUserId,
      messageId: parsed.messageId,
      mode: "send",
      workspaceId
    });

    const upload = await this.storageService.writeRuntimeMarkdownArtifact({
      draft: parsed.draft,
      messageId: parsed.messageId,
      workspaceId
    });

    return this.create({
      id: upload.artifactId,
      kind: "attachment",
      messageId: parsed.messageId,
      mimeType: parsed.draft.mimeType,
      previewUrl: upload.previewUrl,
      storageKey: upload.storageKey,
      title: parsed.draft.title,
      workspaceId
    }, actorUserId);
  }

  private async assertMessageAccess(input: {
    actorUserId: string;
    messageId: string;
    mode: "read" | "send";
    workspaceId: string;
  }): Promise<MessageAccess> {
    const access = await this.resolveMessageAccess({
      ...input,
      hiddenBehavior: "not_found"
    });

    if (!access) {
      throw new NotFoundException(
        `Message ${input.messageId} was not found in workspace ${input.workspaceId}`
      );
    }

    return access;
  }

  private async resolveMessageAccess(input: {
    actorUserId: string;
    hiddenBehavior: "empty" | "not_found";
    messageId: string;
    mode: "read" | "send";
    workspaceId: string;
  }): Promise<MessageAccess | null> {
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
      if (input.hiddenBehavior === "empty") {
        return null;
      }

      throw new NotFoundException(
        `Message ${input.messageId} was not found in workspace ${input.workspaceId}`
      );
    }

    let access: Awaited<ReturnType<ChannelMembersService["assertCanRead"]>>;

    try {
      access = await this.channelMembersService.assertCanRead({
        actorUserId: input.actorUserId,
        channelId: message.conversation_id,
        workspaceId: input.workspaceId
      });
    } catch (error) {
      if (error instanceof ForbiddenException) {
        const wasRemoved = await this.channelMembersService.wasRemovedHumanMember({
          actorUserId: input.actorUserId,
          channelId: message.conversation_id,
          workspaceId: input.workspaceId
        });

        if (wasRemoved) {
          throw error;
        }

        if (input.hiddenBehavior === "empty") {
          return null;
        }

        throw new NotFoundException(
          `Message ${input.messageId} was not found in workspace ${input.workspaceId}`
        );
      }

      throw error;
    }

    if (input.mode === "send" && access.permission === "read") {
      throw new ForbiddenException("你在这个频道里只有只读权限，不能上传产物。");
    }

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
