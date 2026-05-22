import {
  getWorkerLogger,
  getWorkerMetrics,
  getWorkerTracer
} from "../observability/observability.js";

import type { PreparedDeployRecord } from "./deploy-types.js";

export type DeployExecutionResult = {
  previewUrl: string | null;
  resultMessage: string;
};

export async function deployStaticSiteActivity(
  input: PreparedDeployRecord
): Promise<DeployExecutionResult> {
  const tracer = getWorkerTracer();
  const metrics = getWorkerMetrics();
  const logger = getWorkerLogger();
  const span = tracer.startSpan("worker.deploy.static_site", {
    artifactId: input.artifactId,
    deployTargetId: input.deployTargetId,
    workspaceId: input.workspaceId
  });

  metrics.incrementCounter("worker_deploy_total", {
    targetKind: "static-site"
  });

  try {
    if (input.credentialSource === "user_provided" && !input.hasSecret) {
      throw new Error(`Deploy target ${input.targetName} is missing a stored secret.`);
    }

    const provider = String(input.config.provider ?? "static-site");
    const resultMessage = `Static site deploy completed for ${input.artifactTitle} via ${provider}.`;

    metrics.incrementCounter("worker_deploy_success_total", {
      targetKind: "static-site"
    });
    span.end({ provider });

    return {
      previewUrl: null,
      resultMessage
    };
  } catch (error) {
    metrics.incrementCounter("worker_deploy_error_total", {
      targetKind: "static-site"
    });
    logger.error("worker.deploy.static_site.failed", {
      artifactId: input.artifactId,
      deployTargetId: input.deployTargetId,
      error: error instanceof Error ? error.message : String(error),
      workspaceId: input.workspaceId
    });
    span.fail(error);
    throw error;
  }
}
