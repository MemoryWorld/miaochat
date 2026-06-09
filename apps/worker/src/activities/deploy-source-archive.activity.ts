import path from "node:path";

import { PutObjectCommand } from "@aws-sdk/client-s3";
import {
  parseDeployTargetProviderConfig,
  type S3SourceArchiveDeployConfig
} from "@agenthub/contracts";

import {
  getWorkerLogger,
  getWorkerMetrics,
  getWorkerTracer
} from "../observability/observability.js";

import type { PreparedDeployRecord } from "./deploy-types.js";
import {
  createDeployS3Client,
  readDeployArtifactObject
} from "./deploy-artifact-bundle.js";
import type { DeployExecutionResult } from "./deploy-static-site.activity.js";

export async function deploySourceArchiveActivity(
  input: PreparedDeployRecord
): Promise<DeployExecutionResult> {
  const tracer = getWorkerTracer();
  const metrics = getWorkerMetrics();
  const logger = getWorkerLogger();
  const span = tracer.startSpan("worker.deploy.source_archive", {
    artifactId: input.artifactId,
    deployTargetId: input.deployTargetId,
    workspaceId: input.workspaceId
  });

  metrics.incrementCounter("worker_deploy_total", {
    targetKind: "source-archive"
  });

  try {
    const s3Config = parseOptionalS3Config(input.config);
    if (s3Config) {
      const storageKey = await publishSourceArchive(input, s3Config);
      const previewUrl = buildPublicObjectUrl({
        publicBaseUrl: s3Config.publicBaseUrl,
        storageKey
      });

      metrics.incrementCounter("worker_deploy_success_total", {
        targetKind: "source-archive"
      });
      span.end({
        hasDownloadUrl: true,
        provider: "s3-compatible"
      });

      return {
        previewUrl,
        resultMessage: `Source archive published for ${input.artifactTitle}.`
      };
    }

    if (!input.artifactStorageKey) {
      metrics.incrementCounter("worker_deploy_success_total", {
        targetKind: "source-archive"
      });
      span.end({ hasDownloadUrl: false });

      return {
        previewUrl: null,
        resultMessage: `Source archive record prepared for ${input.artifactTitle}, but no downloadable storage key is available.`
      };
    }

    const previewUrl = buildObjectUrl({
      bucket: process.env.S3_BUCKET ?? "agenthub-dev",
      endpoint: process.env.S3_ENDPOINT ?? "http://localhost:9000",
      storageKey: input.artifactStorageKey
    });

    metrics.incrementCounter("worker_deploy_success_total", {
      targetKind: "source-archive"
    });
    span.end({ hasDownloadUrl: true });

    return {
      previewUrl,
      resultMessage: `Source archive download prepared for ${input.artifactTitle}.`
    };
  } catch (error) {
    metrics.incrementCounter("worker_deploy_error_total", {
      targetKind: "source-archive"
    });
    logger.error("worker.deploy.source_archive.failed", {
      artifactId: input.artifactId,
      deployTargetId: input.deployTargetId,
      error: error instanceof Error ? error.message : String(error),
      workspaceId: input.workspaceId
    });
    span.fail(error);
    throw error;
  }
}

async function publishSourceArchive(
  input: PreparedDeployRecord,
  config: S3SourceArchiveDeployConfig
): Promise<string> {
  const body = input.artifactStorageKey
    ? await readDeployArtifactObject(input.artifactStorageKey)
    : Buffer.from(
        `# ${input.artifactTitle}\n\nNo stored artifact object was available for this source archive deployment.\n`,
        "utf8"
      );
  const sourceName = input.artifactStorageKey
    ? path.posix.basename(input.artifactStorageKey)
    : "README.md";
  const targetKey = [
    config.storagePrefix.replace(/\/+$/, ""),
    sanitizeStorageSegment(input.workspaceId),
    sanitizeStorageSegment(input.deploymentId),
    sanitizeStorageSegment(sourceName)
  ].join("/");
  const client = createDeployS3Client();

  await client.send(
    new PutObjectCommand({
      Body: body,
      Bucket: config.bucket ?? process.env.S3_BUCKET ?? "agenthub-dev",
      ContentType: inferArchiveContentType(sourceName),
      Key: targetKey,
      Metadata: {
        artifactId: input.artifactId,
        deployTargetId: input.deployTargetId,
        workspaceId: input.workspaceId
      }
    })
  );

  return targetKey;
}

function parseOptionalS3Config(
  config: Record<string, unknown>
): S3SourceArchiveDeployConfig | null {
  if (config.provider !== "s3-compatible") {
    return null;
  }

  return parseDeployTargetProviderConfig("source-archive", config) as S3SourceArchiveDeployConfig;
}

export function buildPublicObjectUrl(input: {
  publicBaseUrl: string;
  storageKey: string;
}): string {
  const normalizedBase = input.publicBaseUrl.replace(/\/+$/, "");
  const encodedKey = input.storageKey
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");

  return `${normalizedBase}/${encodedKey}`;
}

function buildObjectUrl(input: {
  bucket: string;
  endpoint: string;
  storageKey: string;
}): string {
  const normalizedEndpoint = input.endpoint.replace(/\/+$/, "");
  const encodedKey = input.storageKey
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");

  return `${normalizedEndpoint}/${encodeURIComponent(input.bucket)}/${encodedKey}`;
}

function sanitizeStorageSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-");
}

function inferArchiveContentType(fileName: string): string {
  if (fileName.endsWith(".zip")) {
    return "application/zip";
  }
  if (fileName.endsWith(".json")) {
    return "application/json";
  }
  if (fileName.endsWith(".html")) {
    return "text/html; charset=utf-8";
  }
  if (fileName.endsWith(".md")) {
    return "text/markdown; charset=utf-8";
  }
  return "application/octet-stream";
}
