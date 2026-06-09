import {
  parseDeployTargetProviderConfig,
  type VercelStaticSiteDeployConfig
} from "@agenthub/contracts";

import {
  getWorkerLogger,
  getWorkerMetrics,
  getWorkerTracer
} from "../observability/observability.js";

import type { PreparedDeployRecord } from "./deploy-types.js";
import { loadDeployArtifactBundle } from "./deploy-artifact-bundle.js";
import { createVercelStaticDeployment } from "./deploy-provider-adapters.js";
import { resolveDeployTargetSecret } from "./deploy-secrets.js";

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
    const vercelConfig = parseOptionalVercelConfig(input.config);
    if (vercelConfig) {
      const [bundle, token] = await Promise.all([
        loadDeployArtifactBundle(input),
        resolveDeployTargetSecret({
          envFallbackName: "VERCEL_TOKEN",
          prepared: input
        })
      ]);
      const deployment = await createVercelStaticDeployment({
        config: {
          ...vercelConfig,
          teamId: vercelConfig.teamId ?? process.env.VERCEL_TEAM_ID
        },
        files: bundle.files,
        token
      });

      metrics.incrementCounter("worker_deploy_success_total", {
        targetKind: "static-site"
      });
      span.end({
        provider: "vercel",
        providerDeploymentId: deployment.providerDeploymentId
      });

      return {
        previewUrl: deployment.previewUrl,
        resultMessage: `Static site deployed to Vercel preview for ${input.artifactTitle}.`
      };
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

function parseOptionalVercelConfig(
  config: Record<string, unknown>
): VercelStaticSiteDeployConfig | null {
  if (config.provider !== "vercel") {
    return null;
  }

  return parseDeployTargetProviderConfig("static-site", config) as VercelStaticSiteDeployConfig;
}
