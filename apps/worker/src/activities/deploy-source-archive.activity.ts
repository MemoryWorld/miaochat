import {
  getWorkerLogger,
  getWorkerMetrics,
  getWorkerTracer
} from "../observability/observability.js";

import type { PreparedDeployRecord } from "./deploy-types.js";
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
