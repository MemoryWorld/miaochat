import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  deployContainerActivityMock,
  deploySourceArchiveActivityMock,
  deployStaticSiteActivityMock,
  finalizeDeployActivityMock,
  prepareDeployActivityMock,
  proxyActivitiesMock
} = vi.hoisted(() => ({
  deployContainerActivityMock: vi.fn(),
  deploySourceArchiveActivityMock: vi.fn(),
  deployStaticSiteActivityMock: vi.fn(),
  finalizeDeployActivityMock: vi.fn(),
  prepareDeployActivityMock: vi.fn(),
  proxyActivitiesMock: vi.fn()
}));

vi.mock("@temporalio/workflow", () => ({
  proxyActivities: proxyActivitiesMock
}));

describe("deployArtifactWorkflow", () => {
  beforeEach(() => {
    deployContainerActivityMock.mockReset();
    deploySourceArchiveActivityMock.mockReset();
    deployStaticSiteActivityMock.mockReset();
    finalizeDeployActivityMock.mockReset();
    prepareDeployActivityMock.mockReset();
    proxyActivitiesMock.mockReset();
    vi.resetModules();
  });

  it("runs the static-site branch and finalizes a succeeded deployment timeline", async () => {
    prepareDeployActivityMock.mockResolvedValue({
      artifactId: "artifact_static_1",
      artifactTitle: "Marketing Site",
      config: {
        provider: "netlify"
      },
      credentialSource: "user_provided",
      deployTargetId: "target_static_1",
      deploymentId: "deployment_static_1",
      hasSecret: true,
      ownerUserId: "user_static_1",
      targetKind: "static-site",
      targetName: "Marketing Preview",
      workspaceId: "workspace_deploy_1"
    });
    deployStaticSiteActivityMock.mockResolvedValue({
      previewUrl: null,
      resultMessage: "Static site bundle uploaded."
    });
    finalizeDeployActivityMock.mockImplementation(async (input) => ({
      artifactId: "artifact_static_1",
      completedAt: new Date("2026-05-22T09:00:03.000Z"),
      createdAt: new Date("2026-05-22T09:00:00.000Z"),
      deployTargetId: "target_static_1",
      errorMessage: null,
      id: input.deploymentId,
      ownerUserId: "user_static_1",
      previewUrl: input.previewUrl,
      progressEvents: input.progressEvents,
      resultMessage: input.resultMessage,
      startedAt: new Date("2026-05-22T09:00:00.000Z"),
      status: input.status,
      targetKind: "static-site",
      updatedAt: new Date("2026-05-22T09:00:03.000Z"),
      workspaceId: "workspace_deploy_1"
    }));

    proxyActivitiesMock
      .mockReturnValueOnce({
        prepareDeployActivity: prepareDeployActivityMock
      })
      .mockReturnValueOnce({
        finalizeDeployActivity: finalizeDeployActivityMock
      })
      .mockReturnValueOnce({
        deployStaticSiteActivity: deployStaticSiteActivityMock
      })
      .mockReturnValueOnce({
        deployContainerActivity: deployContainerActivityMock
      })
      .mockReturnValueOnce({
        deploySourceArchiveActivity: deploySourceArchiveActivityMock
      });

    const { deployArtifactWorkflow } = await import(
      "../src/workflows/deploy-artifact.workflow.js"
    );
    const result = await deployArtifactWorkflow({
      artifactId: "artifact_static_1",
      deployTargetId: "target_static_1",
      ownerUserId: "user_static_1",
      workspaceId: "workspace_deploy_1"
    });

    expect(deployStaticSiteActivityMock).toHaveBeenCalledWith(
      expect.objectContaining({
        artifactId: "artifact_static_1",
        deploymentId: "deployment_static_1",
        targetKind: "static-site"
      })
    );
    expect(deployContainerActivityMock).not.toHaveBeenCalled();
    expect(deploySourceArchiveActivityMock).not.toHaveBeenCalled();
    expect(finalizeDeployActivityMock).toHaveBeenCalledWith(
      expect.objectContaining({
        deploymentId: "deployment_static_1",
        resultMessage: "Static site bundle uploaded.",
        status: "succeeded"
      })
    );
    expect(
      finalizeDeployActivityMock.mock.calls[0]?.[0]?.progressEvents.map(
        (event: { label: string }) => event.label
      )
    ).toEqual([
      "deployment.received",
      "deployment.running",
      "deployment.completed"
    ]);
    expect(result).toMatchObject({
      id: "deployment_static_1",
      resultMessage: "Static site bundle uploaded.",
      status: "succeeded",
      targetKind: "static-site"
    });
  });

  it("routes container deploys to the container activity", async () => {
    prepareDeployActivityMock.mockResolvedValue({
      artifactId: "artifact_container_1",
      artifactTitle: "Worker Image",
      config: {
        registry: "ghcr.io/agenthub"
      },
      credentialSource: "platform_managed",
      deployTargetId: "target_container_1",
      deploymentId: "deployment_container_1",
      hasSecret: false,
      ownerUserId: "user_container_1",
      targetKind: "container",
      targetName: "Worker Container",
      workspaceId: "workspace_deploy_1"
    });
    deployContainerActivityMock.mockResolvedValue({
      previewUrl: null,
      resultMessage: "Container image pushed."
    });
    finalizeDeployActivityMock.mockImplementation(async (input) => ({
      artifactId: "artifact_container_1",
      completedAt: new Date("2026-05-22T09:00:03.000Z"),
      createdAt: new Date("2026-05-22T09:00:00.000Z"),
      deployTargetId: "target_container_1",
      errorMessage: null,
      id: input.deploymentId,
      ownerUserId: "user_container_1",
      previewUrl: input.previewUrl,
      progressEvents: input.progressEvents,
      resultMessage: input.resultMessage,
      startedAt: new Date("2026-05-22T09:00:00.000Z"),
      status: input.status,
      targetKind: "container",
      updatedAt: new Date("2026-05-22T09:00:03.000Z"),
      workspaceId: "workspace_deploy_1"
    }));

    proxyActivitiesMock
      .mockReturnValueOnce({
        prepareDeployActivity: prepareDeployActivityMock
      })
      .mockReturnValueOnce({
        finalizeDeployActivity: finalizeDeployActivityMock
      })
      .mockReturnValueOnce({
        deployStaticSiteActivity: deployStaticSiteActivityMock
      })
      .mockReturnValueOnce({
        deployContainerActivity: deployContainerActivityMock
      })
      .mockReturnValueOnce({
        deploySourceArchiveActivity: deploySourceArchiveActivityMock
      });

    const { deployArtifactWorkflow } = await import(
      "../src/workflows/deploy-artifact.workflow.js"
    );
    const result = await deployArtifactWorkflow({
      artifactId: "artifact_container_1",
      deployTargetId: "target_container_1",
      ownerUserId: "user_container_1",
      workspaceId: "workspace_deploy_1"
    });

    expect(deployContainerActivityMock).toHaveBeenCalledWith(
      expect.objectContaining({
        deploymentId: "deployment_container_1",
        targetKind: "container"
      })
    );
    expect(deployStaticSiteActivityMock).not.toHaveBeenCalled();
    expect(deploySourceArchiveActivityMock).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      id: "deployment_container_1",
      resultMessage: "Container image pushed.",
      status: "succeeded",
      targetKind: "container"
    });
  });

  it("routes source-archive deploys to the source archive activity", async () => {
    prepareDeployActivityMock.mockResolvedValue({
      artifactId: "artifact_source_1",
      artifactStorageKey: "artifacts/workspace_deploy/source.zip",
      artifactTitle: "Source Bundle",
      config: {},
      credentialSource: "platform_managed",
      deployTargetId: "target_source_1",
      deploymentId: "deployment_source_1",
      hasSecret: false,
      ownerUserId: "user_source_1",
      targetKind: "source-archive",
      targetName: "Source Download",
      workspaceId: "workspace_deploy_1"
    });
    deploySourceArchiveActivityMock.mockResolvedValue({
      previewUrl:
        "http://localhost:9000/agenthub-dev/artifacts/workspace_deploy/source.zip",
      resultMessage: "Source archive download prepared for Source Bundle."
    });
    finalizeDeployActivityMock.mockImplementation(async (input) => ({
      artifactId: "artifact_source_1",
      completedAt: new Date("2026-05-22T09:00:03.000Z"),
      createdAt: new Date("2026-05-22T09:00:00.000Z"),
      deployTargetId: "target_source_1",
      errorMessage: null,
      id: input.deploymentId,
      ownerUserId: "user_source_1",
      previewUrl: input.previewUrl,
      progressEvents: input.progressEvents,
      resultMessage: input.resultMessage,
      startedAt: new Date("2026-05-22T09:00:00.000Z"),
      status: input.status,
      targetKind: "source-archive",
      updatedAt: new Date("2026-05-22T09:00:03.000Z"),
      workspaceId: "workspace_deploy_1"
    }));

    proxyActivitiesMock
      .mockReturnValueOnce({
        prepareDeployActivity: prepareDeployActivityMock
      })
      .mockReturnValueOnce({
        finalizeDeployActivity: finalizeDeployActivityMock
      })
      .mockReturnValueOnce({
        deployStaticSiteActivity: deployStaticSiteActivityMock
      })
      .mockReturnValueOnce({
        deployContainerActivity: deployContainerActivityMock
      })
      .mockReturnValueOnce({
        deploySourceArchiveActivity: deploySourceArchiveActivityMock
      });

    const { deployArtifactWorkflow } = await import(
      "../src/workflows/deploy-artifact.workflow.js"
    );
    const result = await deployArtifactWorkflow({
      artifactId: "artifact_source_1",
      deployTargetId: "target_source_1",
      ownerUserId: "user_source_1",
      workspaceId: "workspace_deploy_1"
    });

    expect(deploySourceArchiveActivityMock).toHaveBeenCalledWith(
      expect.objectContaining({
        artifactStorageKey: "artifacts/workspace_deploy/source.zip",
        deploymentId: "deployment_source_1",
        targetKind: "source-archive"
      })
    );
    expect(deployContainerActivityMock).not.toHaveBeenCalled();
    expect(deployStaticSiteActivityMock).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      id: "deployment_source_1",
      previewUrl:
        "http://localhost:9000/agenthub-dev/artifacts/workspace_deploy/source.zip",
      resultMessage: "Source archive download prepared for Source Bundle.",
      status: "succeeded",
      targetKind: "source-archive"
    });
  });

});
