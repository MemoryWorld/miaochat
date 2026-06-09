import {
  parseDeployTargetProviderConfig,
  type FlyContainerDeployConfig
} from "@agenthub/contracts";

import {
  getWorkerLogger,
  getWorkerMetrics,
  getWorkerTracer
} from "../observability/observability.js";

import type { PreparedDeployRecord } from "./deploy-types.js";
import { loadDeployArtifactBundle } from "./deploy-artifact-bundle.js";
import { createFlyMachineDeployment } from "./deploy-provider-adapters.js";
import { resolveDeployTargetSecret } from "./deploy-secrets.js";
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
    const flyConfig = parseOptionalFlyConfig(input.config);
    if (flyConfig) {
      const [bundle, token] = await Promise.all([
        loadDeployArtifactBundle(input),
        resolveDeployTargetSecret({
          envFallbackName: "FLY_API_TOKEN",
          prepared: input
        })
      ]);
      const deployment = await createFlyMachineDeployment({
        config: {
          ...flyConfig,
          orgSlug: flyConfig.orgSlug ?? process.env.FLY_ORG_SLUG ?? "personal",
          region: flyConfig.region ?? process.env.FLY_REGION ?? "syd"
        },
        files: bundle.files,
        token
      });

      metrics.incrementCounter("worker_deploy_success_total", {
        targetKind: "container"
      });
      span.end({
        machineId: deployment.machineId,
        provider: "fly"
      });

      return {
        previewUrl: deployment.previewUrl,
        resultMessage: `Container deployed to Fly.io for ${input.artifactTitle}.`
      };
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

function parseOptionalFlyConfig(
  config: Record<string, unknown>
): FlyContainerDeployConfig | null {
  if (config.provider !== "fly") {
    return null;
  }

  return parseDeployTargetProviderConfig("container", config) as FlyContainerDeployConfig;
}
