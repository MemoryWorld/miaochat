import { describe, expect, it } from "vitest";

import {
  formatPhaseADemoCheckReport,
  readPhaseADemoEnvironment,
  runPhaseADemoCheck
} from "../scripts/demo/phase-a-support.js";

describe("phase a demo check", () => {
  it("reports a seed-ready but setup-incomplete state when provider credentials are missing", async () => {
    const environment = readPhaseADemoEnvironment({
      DATABASE_URL: "postgres://agenthub:agenthub@localhost:6432/agenthub",
      REDIS_URL: "redis://localhost:6379",
      TEMPORAL_ADDRESS: "localhost:7233"
    });

    const result = await runPhaseADemoCheck(environment, {
      checkDatabase: async () => true,
      checkSocket: async () => true
    });

    expect(result.readyForSeed).toBe(true);
    expect(result.readyForFullDemo).toBe(false);
    expect(result.providers).toEqual([
      expect.objectContaining({
        configured: false,
        provider: "hermes"
      }),
      expect.objectContaining({
        configured: false,
        provider: "openclaw"
      })
    ]);
    expect(result.nextAction).toContain("/setup");
    expect(formatPhaseADemoCheckReport(result)).toContain("Ready for seed");
  });

  it("reports the local demo as fully ready when both phase-a providers are configured", async () => {
    const environment = readPhaseADemoEnvironment({
      DATABASE_URL: "postgres://agenthub:agenthub@localhost:6432/agenthub",
      HERMES_DEMO_ACCOUNT_ID: "acct_hermes",
      HERMES_DEMO_SECRET: "hermes_demo_secret",
      OPENCLAW_DEMO_ACCOUNT_ID: "acct_openclaw",
      OPENCLAW_DEMO_SECRET: "openclaw_demo_secret",
      REDIS_URL: "redis://localhost:6379",
      TEMPORAL_ADDRESS: "localhost:7233"
    });

    const result = await runPhaseADemoCheck(environment, {
      checkDatabase: async () => true,
      checkSocket: async () => true
    });

    expect(result.readyForSeed).toBe(true);
    expect(result.readyForFullDemo).toBe(true);
    expect(result.nextAction).toContain("local demo recording");
    expect(formatPhaseADemoCheckReport(result)).toContain("Ready for local demo");
  });
});
