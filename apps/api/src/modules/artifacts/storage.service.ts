import { randomUUID } from "node:crypto";
import { Buffer } from "node:buffer";

import { Injectable } from "@nestjs/common";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import {
  artifactUploadTargetSchema,
  prepareArtifactUploadInputSchema,
  type ArtifactUploadTarget,
  type PrepareArtifactUploadInput,
  type RuntimeDiffArtifactDraft,
  type RuntimeMarkdownArtifactDraft
} from "@agenthub/contracts";

type RuntimeArtifactWriteResult = {
  artifactId: string;
  previewUrl: string;
  storageKey: string;
};

@Injectable()
export class StorageService {
  private readonly bucket = process.env.S3_BUCKET ?? "agenthub-dev";
  private readonly endpoint = process.env.S3_ENDPOINT ?? "http://localhost:9000";
  private readonly s3 = new S3Client({
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY ?? "minioadmin",
      secretAccessKey: process.env.S3_SECRET_KEY ?? "minioadmin"
    },
    endpoint: process.env.S3_ENDPOINT ?? "http://localhost:9000",
    forcePathStyle: true,
    region: process.env.S3_REGION ?? "us-east-1"
  });

  async prepareArtifactUpload(
    input: PrepareArtifactUploadInput
  ): Promise<ArtifactUploadTarget> {
    const parsed = prepareArtifactUploadInputSchema.parse(input);
    const artifactId = randomUUID();
    const storageKey = buildStorageKey({
      artifactId,
      fileName: parsed.fileName,
      messageId: parsed.messageId,
      workspaceId: parsed.workspaceId ?? "default-workspace"
    });
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      ContentType: parsed.mimeType,
      Key: storageKey,
      Metadata: {
        artifactId,
        artifactKind: parsed.kind,
        messageId: parsed.messageId,
        workspaceId: parsed.workspaceId ?? "default-workspace"
      }
    });
    const uploadUrl = await getSignedUrl(this.s3, command, {
      expiresIn: 900
    });

    return artifactUploadTargetSchema.parse({
      artifactId,
      previewUrl:
        parsed.kind === "image" || parsed.kind === "preview"
          ? buildObjectUrl(this.endpoint, this.bucket, storageKey)
          : null,
      storageKey,
      uploadHeaders: {
        "content-type": parsed.mimeType
      },
      uploadMethod: "PUT",
      uploadUrl,
      workspaceId: parsed.workspaceId ?? "default-workspace"
    });
  }

  async writeRuntimeMarkdownArtifact(input: {
    draft: RuntimeMarkdownArtifactDraft;
    messageId: string;
    workspaceId: string;
  }): Promise<RuntimeArtifactWriteResult> {
    const artifactId = randomUUID();
    const storageKey = buildStorageKey({
      artifactId,
      fileName: input.draft.fileName,
      messageId: input.messageId,
      workspaceId: input.workspaceId
    });
    const command = new PutObjectCommand({
      Body: Buffer.from(input.draft.markdown, "utf8"),
      Bucket: this.bucket,
      ContentType: input.draft.mimeType,
      Key: storageKey,
      Metadata: {
        artifactId,
        artifactKind: "attachment",
        messageId: input.messageId,
        runtimeArtifactType: input.draft.type,
        workspaceId: input.workspaceId
      }
    });

    await this.s3.send(command);

    return {
      artifactId,
      previewUrl: buildObjectUrl(this.endpoint, this.bucket, storageKey),
      storageKey
    };
  }

  async writeRuntimeDiffArtifact(input: {
    draft: RuntimeDiffArtifactDraft;
    messageId: string;
    workspaceId: string;
  }): Promise<RuntimeArtifactWriteResult> {
    const artifactId = randomUUID();
    const storageKey = buildStorageKey({
      artifactId,
      fileName: input.draft.fileName,
      messageId: input.messageId,
      workspaceId: input.workspaceId
    });
    const command = new PutObjectCommand({
      Body: Buffer.from(input.draft.patch, "utf8"),
      Bucket: this.bucket,
      ContentType: input.draft.mimeType,
      Key: storageKey,
      Metadata: {
        artifactId,
        artifactKind: "diff",
        messageId: input.messageId,
        runtimeArtifactType: input.draft.type,
        workspaceId: input.workspaceId
      }
    });

    await this.s3.send(command);

    return {
      artifactId,
      previewUrl: buildObjectUrl(this.endpoint, this.bucket, storageKey),
      storageKey
    };
  }
}

function buildStorageKey(input: {
  artifactId: string;
  fileName: string;
  messageId: string;
  workspaceId: string;
}): string {
  return [
    "artifacts",
    sanitizeStorageSegment(input.workspaceId),
    sanitizeStorageSegment(input.messageId),
    sanitizeStorageSegment(input.artifactId),
    sanitizeStorageSegment(input.fileName)
  ].join("/");
}

function buildObjectUrl(endpoint: string, bucket: string, storageKey: string): string {
  const normalizedEndpoint = endpoint.replace(/\/+$/, "");
  const encodedKey = storageKey
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");

  return `${normalizedEndpoint}/${encodeURIComponent(bucket)}/${encodedKey}`;
}

function sanitizeStorageSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-");
}
