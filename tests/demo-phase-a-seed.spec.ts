import { describe, expect, it } from "vitest";

import {
  createInMemoryPhaseADemoStore,
  formatPhaseADemoSeedReport,
  seedPhaseADemoData
} from "../scripts/demo/seed-phase-a-lib.js";
import { readPhaseADemoEnvironment } from "../scripts/demo/phase-a-support.js";

describe("phase a demo seed", () => {
  it("creates the fixed demo fixtures idempotently and binds configured provider credentials", async () => {
    const environment = readPhaseADemoEnvironment({
      HERMES_DEMO_ACCOUNT_ID: "acct_hermes",
      HERMES_DEMO_SECRET: "hermes_demo_secret",
      OPENCLAW_DEMO_ACCOUNT_ID: "acct_openclaw",
      OPENCLAW_DEMO_SECRET: "openclaw_demo_secret"
    });
    const store = createInMemoryPhaseADemoStore();

    const firstRun = await seedPhaseADemoData(store, environment);
    const secondRun = await seedPhaseADemoData(store, environment);

    expect(firstRun.user.email).toBe("phase-a-demo@example.com");
    expect(firstRun.workspace.id).toBe("default-workspace");
    expect(firstRun.conversations).toEqual([
      expect.objectContaining({
        mode: "direct",
        title: "单人协作频道"
      }),
      expect.objectContaining({
        mode: "group",
        title: "方案落地协作频道"
      }),
      expect.objectContaining({
        mode: "direct",
        title: "交付物评审频道"
      })
    ]);
    expect(firstRun.credentials).toEqual([
      expect.objectContaining({
        provider: "hermes",
        status: "bound"
      }),
      expect.objectContaining({
        provider: "openclaw",
        status: "bound"
      })
    ]);
    expect(secondRun.summary.counts).toEqual(firstRun.summary.counts);
    expect(store.snapshot()).toEqual(
      expect.objectContaining({
        artifactCount: 3,
        conversationCount: 3,
        credentialCount: 2,
        messageCount: 7,
        userCount: 1,
        workspaceCount: 1
      })
    );
    expect(formatPhaseADemoSeedReport(firstRun)).toContain("单人协作频道");
  });

  it("skips provider binding when demo credentials are absent and points the operator to setup", async () => {
    const environment = readPhaseADemoEnvironment({});
    const store = createInMemoryPhaseADemoStore();

    const result = await seedPhaseADemoData(store, environment);

    expect(result.credentials).toEqual([
      expect.objectContaining({
        provider: "hermes",
        status: "manual_setup_required"
      }),
      expect.objectContaining({
        provider: "openclaw",
        status: "manual_setup_required"
      })
    ]);
    expect(result.nextAction).toContain("/setup");
    expect(store.snapshot().credentialCount).toBe(0);
  });
});
