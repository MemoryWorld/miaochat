import { describe, expect, it } from "vitest";

import {
  formatPhaseADemoCheckReport,
  runPhaseADemoCheck,
  type PhaseADemoEnvironment
} from "./phase-a-support.js";
import {
  createInMemoryPhaseADemoStore,
  formatPhaseADemoSeedReport,
  seedPhaseADemoData
} from "./seed-phase-a-lib.js";

const forbiddenProductTerms = /hermes|openclaw/i;

describe("Phase A demo seed product naming", () => {
  it("does not expose internal provider names in user-visible seed content", async () => {
    const store = createInMemoryPhaseADemoStore();
    const result = await seedPhaseADemoData(store, makeEnvironment());
    const snapshot = store.snapshot();
    const visibleText = [
      formatPhaseADemoSeedReport(result),
      ...result.conversations.map((conversation) => conversation.title),
      ...result.customAgents.map((agent) => agent.name),
      ...result.credentials.map((credential) => credential.label),
      ...snapshot.messages.map((message) => message.content)
    ].join("\n");

    expect(visibleText).not.toMatch(forbiddenProductTerms);
  });

  it("keeps manual setup labels product-safe when model connections are missing", async () => {
    const store = createInMemoryPhaseADemoStore();
    const result = await seedPhaseADemoData(store, {
      ...makeEnvironment(),
      providers: makeEnvironment().providers.map((provider) => ({
        ...provider,
        accountId: null,
        configured: false,
        secret: null
      }))
    });

    expect(formatPhaseADemoSeedReport(result)).not.toMatch(forbiddenProductTerms);
  });

  it("keeps demo check output product-safe even when legacy env names are configured", async () => {
    const result = await runPhaseADemoCheck(makeEnvironment(), {
      checkDatabase: async () => true,
      checkSocket: async () => true
    });

    expect(formatPhaseADemoCheckReport(result)).not.toMatch(forbiddenProductTerms);
  });
});

function makeEnvironment(): PhaseADemoEnvironment {
  return {
    credentialEncryptionKey: "test-credential-key",
    databaseUrl: "postgres://agenthub:agenthub@localhost:6432/agenthub_local",
    demoEmail: "phase-a-demo@example.com",
    demoPassword: "PhaseADemo!123",
    minioEndpoint: "http://localhost:9000",
    providers: [
      {
        accountId: "acct_primary",
        accountIdEnvName: "HERMES_DEMO_ACCOUNT_ID",
        configured: true,
        provider: "hermes",
        secret: "hermes_secret",
        secretEnvName: "HERMES_DEMO_SECRET"
      },
      {
        accountId: "acct_secondary",
        accountIdEnvName: "OPENCLAW_DEMO_ACCOUNT_ID",
        configured: true,
        provider: "openclaw",
        secret: "openclaw_secret",
        secretEnvName: "OPENCLAW_DEMO_SECRET"
      }
    ],
    redisUrl: "redis://localhost:6379",
    temporalAddress: "localhost:7233"
  };
}
