import type {
  Deployment,
  DeploymentProgressEvent,
  DeploymentStatus
} from "@agenthub/contracts";
import { proxyActivities } from "@temporalio/workflow";

import type {
  finalizeDeployActivity as finalizeDeployActivityFn,
  prepareDeployActivity as prepareDeployActivityFn
} from "../activities/deploy-persistence.activity.js";
import type {
  deployContainerActivity as deployContainerActivityFn
} from "../activities/deploy-container.activity.js";
import type {
  deploySourceArchiveActivity as deploySourceArchiveActivityFn
} from "../activities/deploy-source-archive.activity.js";
import type {
  deployStaticSiteActivity as deployStaticSiteActivityFn
} from "../activities/deploy-static-site.activity.js";
import type { PreparedDeployRecord } from "../activities/deploy-types.js";

const { prepareDeployActivity } = proxyActivities<{
  prepareDeployActivity: typeof prepareDeployActivityFn;
}>({
  startToCloseTimeout: "1 minute"
});

const { finalizeDeployActivity } = proxyActivities<{
  finalizeDeployActivity: typeof finalizeDeployActivityFn;
}>({
  startToCloseTimeout: "1 minute"
});

const { deployStaticSiteActivity } = proxyActivities<{
  deployStaticSiteActivity: typeof deployStaticSiteActivityFn;
}>({
  startToCloseTimeout: "1 minute"
});

const { deployContainerActivity } = proxyActivities<{
  deployContainerActivity: typeof deployContainerActivityFn;
}>({
  startToCloseTimeout: "1 minute"
});

const { deploySourceArchiveActivity } = proxyActivities<{
  deploySourceArchiveActivity: typeof deploySourceArchiveActivityFn;
}>({
  startToCloseTimeout: "1 minute"
});

export type DeployArtifactWorkflowInput = {
  artifactId: string;
  deployTargetId: string;
  ownerUserId: string;
  workspaceId: string;
};

export async function deployArtifactWorkflow(
  input: DeployArtifactWorkflowInput
): Promise<Deployment> {
  const receivedEvent = createProgressEvent(
    "deployment.received",
    "queued",
    "Deployment request accepted.",
    {
      artifactId: input.artifactId,
      deployTargetId: input.deployTargetId
    }
  );
  const progressEvents: DeploymentProgressEvent[] = [receivedEvent];

  const prepared = await prepareDeployActivity({
    ...input,
    initialProgressEvent: receivedEvent
  });

  progressEvents.push(
    createProgressEvent("deployment.running", "running", "Deployment execution started.", {
      deploymentId: prepared.deploymentId,
      targetKind: prepared.targetKind,
      targetName: prepared.targetName
    })
  );

  try {
    const execution = await runDeploy(prepared);
    progressEvents.push(
      createProgressEvent("deployment.completed", "succeeded", execution.resultMessage, {
        deploymentId: prepared.deploymentId,
        previewUrl: execution.previewUrl,
        targetKind: prepared.targetKind
      })
    );

    return finalizeDeployActivity({
      deploymentId: prepared.deploymentId,
      errorMessage: null,
      ownerUserId: input.ownerUserId,
      previewUrl: execution.previewUrl,
      progressEvents,
      resultMessage: execution.resultMessage,
      status: "succeeded",
      workspaceId: input.workspaceId
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Deployment execution failed.";
    progressEvents.push(
      createProgressEvent("deployment.failed", "failed", errorMessage, {
        deploymentId: prepared.deploymentId,
        targetKind: prepared.targetKind
      })
    );

    return finalizeDeployActivity({
      deploymentId: prepared.deploymentId,
      errorMessage,
      ownerUserId: input.ownerUserId,
      previewUrl: null,
      progressEvents,
      resultMessage: "Deployment failed.",
      status: "failed",
      workspaceId: input.workspaceId
    });
  }
}

async function runDeploy(
  prepared: PreparedDeployRecord
): Promise<{ previewUrl: string | null; resultMessage: string }> {
  switch (prepared.targetKind) {
    case "static-site":
      return deployStaticSiteActivity(prepared);
    case "container":
      return deployContainerActivity(prepared);
    case "source-archive":
      return deploySourceArchiveActivity(prepared);
  }
}

function createProgressEvent(
  label: DeploymentProgressEvent["label"],
  status: DeploymentStatus,
  message: string,
  metadata: Record<string, unknown>
): DeploymentProgressEvent {
  return {
    at: new Date().toISOString(),
    label,
    message,
    metadata,
    status
  };
}
