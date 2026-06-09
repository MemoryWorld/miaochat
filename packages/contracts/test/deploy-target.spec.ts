import { describe, expect, it } from "vitest";

import {
  flyContainerDeployConfigSchema,
  parseDeployTargetProviderConfig,
  s3SourceArchiveDeployConfigSchema,
  vercelStaticSiteDeployConfigSchema
} from "../src/deploy-target.js";

describe("deploy target provider configs", () => {
  it("normalizes Vercel static-site deploy config to preview deployments", () => {
    expect(
      vercelStaticSiteDeployConfigSchema.parse({
        projectName: "miaochat-preview",
        provider: "vercel"
      })
    ).toMatchObject({
      projectName: "miaochat-preview",
      provider: "vercel",
      target: "preview"
    });
  });

  it("normalizes Fly container deploy config with safe defaults", () => {
    expect(
      flyContainerDeployConfigSchema.parse({
        appName: "miaochat-container-preview",
        provider: "fly"
      })
    ).toMatchObject({
      allocateSharedIpv4: true,
      appName: "miaochat-container-preview",
      orgSlug: "personal",
      provider: "fly",
      region: "syd"
    });
  });

  it("requires a public source archive base URL", () => {
    expect(() =>
      s3SourceArchiveDeployConfigSchema.parse({
        provider: "s3-compatible"
      })
    ).toThrow();

    expect(
      s3SourceArchiveDeployConfigSchema.parse({
        provider: "s3-compatible",
        publicBaseUrl: "https://downloads.example.test/miaochat"
      })
    ).toMatchObject({
      provider: "s3-compatible",
      publicBaseUrl: "https://downloads.example.test/miaochat"
    });
  });

  it("selects config validation by deploy target kind", () => {
    expect(
      parseDeployTargetProviderConfig("static-site", {
        provider: "vercel"
      })
    ).toMatchObject({
      provider: "vercel"
    });
    expect(() =>
      parseDeployTargetProviderConfig("container", {
        provider: "vercel"
      })
    ).toThrow();
  });
});
