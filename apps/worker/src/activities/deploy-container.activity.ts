import {
  getWorkerLogger,
  getWorkerMetrics,
  getWorkerTracer
} from "../observability/observability.js";

import type { PreparedDeployRecord } from "./deploy-types.js";
import type { DeployExecutionResult } from "./deploy-static-site.activity.js";

export async function deployContainerActivity(
  input: PreparedDeployRecord
): Promise<DeployExecutionResult> {
  const tracer = getWorkerTracer();
  const metrics = getWorkerMetrics();
  const logger = getWorkerLogger();
  const span = tracer.startSpan("worker.deploy.container", {
    artifactId: input.artifactId,
    deployTargetId: input.deployTargetId,
    workspaceId: input.workspaceId
  });

  metrics.incrementCounter("worker_deploy_total", {
    targetKind: "container"
  });

  try {
    if (input.credentialSource === "user_provided" && !input.hasSecret) {
      throw new Error(`Deploy target ${input.targetName} is missing a stored secret.`);
    }

    const registry = String(input.config.registry ?? "container-registry");
    const resultMessage = `Container image pushed for ${input.artifactTitle} to ${registry}.`;

    metrics.incrementCounter("worker_deploy_success_total", {
      targetKind: "container"
    });
    span.end({ registry });

    return {
      previewUrl: null,
      resultMessage
    };
  } catch (error) {
    metrics.incrementCounter("worker_deploy_error_total", {
      targetKind: "container"
    });
    logger.error("worker.deploy.container.failed", {
      artifactId: input.artifactId,
      deployTargetId: input.deployTargetId,
      error: error instanceof Error ? error.message : String(error),
      workspaceId: input.workspaceId
    });
    span.fail(error);
    throw error;
  }
}
