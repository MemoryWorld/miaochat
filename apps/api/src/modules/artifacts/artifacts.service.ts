import { randomUUID } from "node:crypto";
import type { Readable } from "node:stream";

import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import { sql } from "drizzle-orm";
import { DatabaseError } from "pg";
import { z } from "zod";

import {
  artifactDownloadUrlSchema,
  artifactQuerySchema,
  artifactReadQuerySchema,
  artifactSchema,
  artifactTextContentSchema,
  createArtifactInputSchema,
  messageIdSchema,
  prepareArtifactUploadInputSchema,
  runtimeDiffArtifactDraftSchema,
  runtimeMarkdownArtifactDraftSchema,
  runtimeWebpageArtifactDraftSchema,
  workspaceIdSchema,
  type Artifact,
  type ArtifactDownloadUrl,
  type ArtifactTextContent,
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

export type ArtifactFileContent = {
  body: Readable;
  contentLength: number | null;
  fileName: string;
  mimeType: string;
};

const createRuntimeMarkdownArtifactInputSchema = z.object({
  draft: runtimeMarkdownArtifactDraftSchema,
  messageId: messageIdSchema,
  workspaceId: workspaceIdSchema.optional()
});

const createRuntimeDiffArtifactInputSchema = z.object({
  draft: runtimeDiffArtifactDraftSchema,
  messageId: messageIdSchema,
  workspaceId: workspaceIdSchema.optional()
});

const createRuntimeWebpageArtifactInputSchema = z.object({
  draft: runtimeWebpageArtifactDraftSchema,
  messageId: messageIdSchema,
  workspaceId: workspaceIdSchema.optional()
});

const artifactTextPreviewMaxBytes = 128 * 1024;

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

    if (parsed.messageId) {
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

    if (parsed.conversationId) {
      let access: Awaited<ReturnType<ChannelMembersService["assertCanRead"]>>;

      try {
        access = await this.channelMembersService.assertCanRead({
          actorUserId,
          channelId: parsed.conversationId,
          workspaceId: parsed.workspaceId
        });
      } catch (error) {
        if (error instanceof ForbiddenException) {
          return [];
        }

        throw error;
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
        WHERE messages.conversation_id = ${parsed.conversationId}
          AND artifacts.workspace_id = ${parsed.workspaceId}
          AND messages.owner_user_id = ${access.ownerUserId}
        ORDER BY artifacts.created_at ASC, artifacts.id ASC
      `);

      return result.rows.map(mapArtifactRow);
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
      WHERE artifacts.workspace_id = ${parsed.workspaceId}
        AND (
          messages.owner_user_id = ${actorUserId}
          OR EXISTS (
            SELECT 1
            FROM channel_user_memberships
            WHERE channel_user_memberships.channel_id = messages.conversation_id
              AND channel_user_memberships.workspace_id = messages.workspace_id
              AND channel_user_memberships.workspace_owner_user_id = messages.owner_user_id
              AND channel_user_memberships.user_id = ${actorUserId}
              AND channel_user_memberships.status = 'active'
              AND channel_user_memberships.removed_at IS NULL
          )
        )
      ORDER BY artifacts.created_at DESC, artifacts.id DESC
      LIMIT 100
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

  async readTextContent(
    input: unknown,
    actorUserId: string
  ): Promise<ArtifactTextContent> {
    const parsed = artifactReadQuerySchema.parse(input);
    const artifact = await this.loadArtifactForRead({
      actorUserId,
      artifactId: parsed.artifactId,
      workspaceId: parsed.workspaceId
    });

    if (!artifact.storageKey) {
      throw new NotFoundException(`Artifact ${artifact.id} has no stored content.`);
    }

    if (!isReadableTextMimeType(artifact.mimeType)) {
      throw new BadRequestException("这个产物类型暂不支持内联文本预览。");
    }

    const content = await this.storageService.readTextObject({
      maxBytes: artifactTextPreviewMaxBytes,
      storageKey: artifact.storageKey
    });

    return artifactTextContentSchema.parse({
      artifactId: artifact.id,
      content: content.content,
      mimeType: artifact.mimeType,
      title: artifact.title,
      truncated: content.truncated
    });
  }

  async createDownloadUrl(
    input: unknown,
    actorUserId: string
  ): Promise<ArtifactDownloadUrl> {
    const parsed = artifactReadQuerySchema.parse(input);
    const artifact = await this.loadArtifactForRead({
      actorUserId,
      artifactId: parsed.artifactId,
      workspaceId: parsed.workspaceId
    });

    if (!artifact.storageKey) {
      throw new NotFoundException(`Artifact ${artifact.id} has no stored content.`);
    }

    const downloadUrl = await this.storageService.getDownloadUrl({
      fileName: resolveDownloadFileName(artifact),
      mimeType: artifact.mimeType,
      storageKey: artifact.storageKey
    });

    return artifactDownloadUrlSchema.parse({ downloadUrl });
  }

  async readFileContent(
    input: unknown,
    actorUserId: string
  ): Promise<ArtifactFileContent> {
    const parsed = artifactReadQuerySchema.parse(input);
    const artifact = await this.loadArtifactForRead({
      actorUserId,
      artifactId: parsed.artifactId,
      workspaceId: parsed.workspaceId
    });

    if (!artifact.storageKey) {
      throw new NotFoundException(`Artifact ${artifact.id} has no stored content.`);
    }

    const object = await this.storageService.readObject({
      storageKey: artifact.storageKey
    });

    return {
      body: object.body,
      contentLength: object.contentLength,
      fileName: resolveDownloadFileName(artifact),
      mimeType: artifact.mimeType
    };
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

  async createRuntimeDiffArtifact(
    input: unknown,
    actorUserId: string
  ): Promise<Artifact> {
    const parsed = createRuntimeDiffArtifactInputSchema.parse(input);
    const workspaceId = parsed.workspaceId ?? "default-workspace";

    await this.assertMessageAccess({
      actorUserId,
      messageId: parsed.messageId,
      mode: "send",
      workspaceId
    });

    const upload = await this.storageService.writeRuntimeDiffArtifact({
      draft: parsed.draft,
      messageId: parsed.messageId,
      workspaceId
    });

    return this.create({
      id: upload.artifactId,
      kind: "diff",
      messageId: parsed.messageId,
      mimeType: parsed.draft.mimeType,
      previewUrl: upload.previewUrl,
      storageKey: upload.storageKey,
      title: parsed.draft.title,
      workspaceId
    }, actorUserId);
  }

  async createRuntimeWebpageArtifact(
    input: unknown,
    actorUserId: string
  ): Promise<Artifact> {
    const parsed = createRuntimeWebpageArtifactInputSchema.parse(input);
    const workspaceId = parsed.workspaceId ?? "default-workspace";

    await this.assertMessageAccess({
      actorUserId,
      messageId: parsed.messageId,
      mode: "send",
      workspaceId
    });

    const upload = await this.storageService.writeRuntimeWebpageArtifact({
      draft: parsed.draft,
      messageId: parsed.messageId,
      workspaceId
    });

    return this.create({
      id: upload.artifactId,
      kind: "preview",
      messageId: parsed.messageId,
      mimeType: parsed.draft.mimeType,
      previewUrl: upload.previewUrl,
      storageKey: upload.storageKey,
      title: parsed.draft.title,
      workspaceId
    }, actorUserId);
  }

  private async loadArtifactForRead(input: {
    actorUserId: string;
    artifactId: string;
    workspaceId: string;
  }): Promise<Artifact> {
    const result = await this.database.execute<ArtifactRow>(sql`
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
      WHERE id = ${input.artifactId}
        AND workspace_id = ${input.workspaceId}
      LIMIT 1
    `);
    const row = result.rows[0];

    if (!row) {
      throw new NotFoundException(
        `Artifact ${input.artifactId} was not found in workspace ${input.workspaceId}`
      );
    }

    const artifact = mapArtifactRow(row);

    await this.assertMessageAccess({
      actorUserId: input.actorUserId,
      messageId: artifact.messageId,
      mode: "read",
      workspaceId: input.workspaceId
    });

    return artifact;
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

function isReadableTextMimeType(mimeType: string): boolean {
  const normalized = mimeType.toLowerCase();

  return (
    normalized.startsWith("text/") ||
    normalized.includes("markdown") ||
    normalized.includes("json") ||
    normalized.includes("xml") ||
    normalized === "application/javascript" ||
    normalized === "application/typescript"
  );
}

function resolveDownloadFileName(artifact: Artifact): string {
  if (/\.[a-z0-9]{1,8}$/i.test(artifact.title)) {
    return artifact.title;
  }

  return `${artifact.title}${extensionForMimeType(artifact.mimeType)}`;
}

function extensionForMimeType(mimeType: string): string {
  const normalized = mimeType.toLowerCase();

  if (normalized.includes("markdown")) {
    return ".md";
  }

  if (normalized.includes("x-diff") || normalized.includes("patch")) {
    return ".diff";
  }

  if (normalized.includes("html")) {
    return ".html";
  }

  if (normalized.includes("json")) {
    return ".json";
  }

  if (normalized.includes("png")) {
    return ".png";
  }

  if (normalized.includes("jpeg") || normalized.includes("jpg")) {
    return ".jpg";
  }

  return "";
}
