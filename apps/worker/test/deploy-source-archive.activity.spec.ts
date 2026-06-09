import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/observability/observability.js", () => ({
  getWorkerLogger: () => ({
    error: vi.fn()
  }),
  getWorkerMetrics: () => ({
    incrementCounter: vi.fn()
  }),
  getWorkerTracer: () => ({
    startSpan: () => ({
      end: vi.fn(),
      fail: vi.fn()
    })
  })
}));

const originalEnv = {
  S3_BUCKET: process.env.S3_BUCKET,
  S3_ENDPOINT: process.env.S3_ENDPOINT
};

describe("deploySourceArchiveActivity", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.S3_BUCKET = "agenthub dev";
    process.env.S3_ENDPOINT = "https://storage.example.test/";
  });

  afterEach(() => {
    restoreEnv("S3_BUCKET", originalEnv.S3_BUCKET);
    restoreEnv("S3_ENDPOINT", originalEnv.S3_ENDPOINT);
  });

  it("builds an object storage download URL from the artifact storage key", async () => {
    const { deploySourceArchiveActivity } = await import(
      "../src/activities/deploy-source-archive.activity.js"
    );

    const result = await deploySourceArchiveActivity({
      artifactId: "artifact_source_1",
      artifactStorageKey: "artifacts/workspace deploy/source bundle.zip",
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

    expect(result).toEqual({
      previewUrl:
        "https://storage.example.test/agenthub%20dev/artifacts/workspace%20deploy/source%20bundle.zip",
      resultMessage: "Source archive download prepared for Source Bundle."
    });
  });

  it("returns a succeeded record without a URL when the artifact has no storage key", async () => {
    const { deploySourceArchiveActivity } = await import(
      "../src/activities/deploy-source-archive.activity.js"
    );

    const result = await deploySourceArchiveActivity({
      artifactId: "artifact_source_2",
      artifactStorageKey: null,
      artifactTitle: "Inline Source Notes",
      config: {},
      credentialSource: "platform_managed",
      deployTargetId: "target_source_2",
      deploymentId: "deployment_source_2",
      hasSecret: false,
      ownerUserId: "user_source_2",
      targetKind: "source-archive",
      targetName: "Source Download",
      workspaceId: "workspace_deploy_1"
    });

    expect(result).toEqual({
      previewUrl: null,
      resultMessage:
        "Source archive record prepared for Inline Source Notes, but no downloadable storage key is available."
    });
  });
});

function restoreEnv(key: "S3_BUCKET" | "S3_ENDPOINT", value: string | undefined): void {
  if (typeof value === "string") {
    process.env[key] = value;
    return;
  }

  delete process.env[key];
}
