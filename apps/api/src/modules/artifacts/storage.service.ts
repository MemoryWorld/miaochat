import { randomUUID } from "node:crypto";

import { Injectable } from "@nestjs/common";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import {
  artifactUploadTargetSchema,
  prepareArtifactUploadInputSchema,
  type ArtifactUploadTarget,
  type PrepareArtifactUploadInput
} from "@agenthub/contracts";

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
