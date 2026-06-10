import { randomUUID } from "node:crypto";
import { Buffer } from "node:buffer";
import { Readable } from "node:stream";

import { Injectable } from "@nestjs/common";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import {
  artifactUploadTargetSchema,
  prepareArtifactUploadInputSchema,
  type ArtifactUploadTarget,
  type PrepareArtifactUploadInput,
  type RuntimeDiffArtifactDraft,
  type RuntimeMarkdownArtifactDraft,
  type RuntimeSlidesArtifactDraft,
  type RuntimeWebpageArtifactDraft
} from "@agenthub/contracts";

type RuntimeArtifactWriteResult = {
  artifactId: string;
  previewUrl: string;
  storageKey: string;
};

type TextObjectReadResult = {
  content: string;
  truncated: boolean;
};

type ObjectReadResult = {
  body: Readable;
  contentLength: number | null;
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

  async writeTextAttachment(input: {
    content: string;
    fileName: string;
    messageId: string;
    mimeType: string;
    workspaceId: string;
  }): Promise<RuntimeArtifactWriteResult> {
    const artifactId = randomUUID();
    const storageKey = buildStorageKey({
      artifactId,
      fileName: input.fileName,
      messageId: input.messageId,
      workspaceId: input.workspaceId
    });
    const command = new PutObjectCommand({
      Body: Buffer.from(input.content, "utf8"),
      Bucket: this.bucket,
      ContentType: input.mimeType,
      Key: storageKey,
      Metadata: {
        artifactId,
        artifactKind: "attachment",
        messageId: input.messageId,
        uploadedAs: "chat-attachment",
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

  async writeRuntimeWebpageArtifact(input: {
    draft: RuntimeSlidesArtifactDraft | RuntimeWebpageArtifactDraft;
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
      Body: Buffer.from(input.draft.html, "utf8"),
      Bucket: this.bucket,
      ContentType: input.draft.mimeType,
      Key: storageKey,
      Metadata: {
        artifactId,
        artifactKind: "preview",
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

  async writeRuntimeBinaryArtifact(input: {
    body: Buffer;
    contentType: string;
    fileName: string;
    messageId: string;
    runtimeArtifactType: string;
    workspaceId: string;
  }): Promise<RuntimeArtifactWriteResult> {
    const artifactId = randomUUID();
    const storageKey = buildStorageKey({
      artifactId,
      fileName: input.fileName,
      messageId: input.messageId,
      workspaceId: input.workspaceId
    });
    const command = new PutObjectCommand({
      Body: input.body,
      Bucket: this.bucket,
      ContentType: input.contentType,
      Key: storageKey,
      Metadata: {
        artifactId,
        artifactKind: "attachment",
        messageId: input.messageId,
        runtimeArtifactType: input.runtimeArtifactType,
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

  async readTextObject(input: {
    maxBytes: number;
    storageKey: string;
  }): Promise<TextObjectReadResult> {
    const response = await this.s3.send(new GetObjectCommand({
      Bucket: this.bucket,
      Key: input.storageKey,
      Range: `bytes=0-${input.maxBytes}`
    }));
    const body = response.Body;

    if (!body) {
      return {
        content: "",
        truncated: false
      };
    }

    const { buffer, truncated } = await readBodyWithLimit(body, input.maxBytes);

    return {
      content: buffer.toString("utf8"),
      truncated: truncated || isRangeResponseTruncated(response.ContentRange, input.maxBytes)
    };
  }

  async readObject(input: {
    storageKey: string;
  }): Promise<ObjectReadResult> {
    const response = await this.s3.send(new GetObjectCommand({
      Bucket: this.bucket,
      Key: input.storageKey
    }));

    return {
      body: await toReadableBody(response.Body),
      contentLength: typeof response.ContentLength === "number" ? response.ContentLength : null
    };
  }

  async getDownloadUrl(input: {
    fileName: string;
    mimeType: string;
    storageKey: string;
  }): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: input.storageKey,
      ResponseContentDisposition: `attachment; filename="${sanitizeDownloadFileName(input.fileName)}"`,
      ResponseContentType: input.mimeType
    });

    return getSignedUrl(this.s3, command, {
      expiresIn: 900
    });
  }
}

async function toReadableBody(body: unknown): Promise<Readable> {
  if (!body) {
    return Readable.from([]);
  }

  if (body instanceof Readable) {
    return body;
  }

  if (typeof body === "string" || body instanceof Uint8Array) {
    return Readable.from([body]);
  }

  if (typeof body === "object" && body !== null && "transformToWebStream" in body) {
    return Readable.fromWeb(
      (body as { transformToWebStream: () => ReadableStream<Uint8Array> }).transformToWebStream()
    );
  }

  if (isAsyncIterable(body)) {
    return Readable.from(body as AsyncIterable<Buffer | string | Uint8Array>);
  }

  if (typeof body === "object" && body !== null && "transformToByteArray" in body) {
    const bytes = await (body as { transformToByteArray: () => Promise<Uint8Array> }).transformToByteArray();
    return Readable.from([Buffer.from(bytes)]);
  }

  return Readable.from([]);
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

async function readBodyWithLimit(
  body: unknown,
  maxBytes: number
): Promise<{ buffer: Buffer; truncated: boolean }> {
  if (typeof body === "object" && body !== null && "transformToByteArray" in body) {
    const bytes = Buffer.from(
      await (body as { transformToByteArray: () => Promise<Uint8Array> }).transformToByteArray()
    );

    return {
      buffer: bytes.subarray(0, maxBytes),
      truncated: bytes.length > maxBytes
    };
  }

  if (typeof body === "string" || body instanceof Uint8Array) {
    const bytes = Buffer.from(body);
    return {
      buffer: bytes.subarray(0, maxBytes),
      truncated: bytes.length > maxBytes
    };
  }

  if (body instanceof Readable || isAsyncIterable(body)) {
    const chunks: Buffer[] = [];
    let totalBytes = 0;
    let truncated = false;

    for await (const chunk of body as AsyncIterable<Buffer | string | Uint8Array>) {
      const bytes = Buffer.from(chunk);
      const remainingBytes = maxBytes - totalBytes;

      if (remainingBytes <= 0) {
        truncated = true;
        break;
      }

      chunks.push(bytes.subarray(0, remainingBytes));
      totalBytes += Math.min(bytes.length, remainingBytes);

      if (bytes.length > remainingBytes) {
        truncated = true;
        break;
      }
    }

    return {
      buffer: Buffer.concat(chunks),
      truncated
    };
  }

  return {
    buffer: Buffer.alloc(0),
    truncated: false
  };
}

function isAsyncIterable(value: unknown): value is AsyncIterable<unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    Symbol.asyncIterator in value
  );
}

function sanitizeDownloadFileName(fileName: string): string {
  const sanitized = fileName
    .replace(/["\\\r\n]/g, "")
    .replace(/[/]+/g, "-")
    .trim();

  return sanitized.length > 0 ? sanitized : "artifact";
}

function isRangeResponseTruncated(
  contentRange: string | undefined,
  maxBytes: number
): boolean {
  if (!contentRange) {
    return false;
  }

  const match = /bytes\s+\d+-\d+\/(\d+)/i.exec(contentRange);
  const totalBytes = match ? Number.parseInt(match[1] ?? "", 10) : Number.NaN;

  return Number.isFinite(totalBytes) && totalBytes > maxBytes;
}
