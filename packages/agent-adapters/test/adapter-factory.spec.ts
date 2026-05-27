import { describe, expect, it } from "vitest";

import {
  HermesAdapter,
  MockDirectAdapter,
  MockGroupAdapter,
  OpenClawAdapter,
  createAgentAdapter
} from "../src";

const credentialResolver = async () => ({
  providerAccountId: "acct_runtime",
  secret: "runtime_secret_123"
});

describe("createAgentAdapter", () => {
  it("returns the mock direct adapter for direct mock execution", () => {
    const adapter = createAgentAdapter({
      executionMode: "direct",
      provider: "mock"
    });

    expect(adapter).toBeInstanceOf(MockDirectAdapter);
  });

  it("returns the mock group adapter for group mock execution", () => {
    const adapter = createAgentAdapter({
      executionMode: "group",
      provider: "mock"
    });

    expect(adapter).toBeInstanceOf(MockGroupAdapter);
  });

  it("returns the Hermes adapter when runtime streaming options are provided", () => {
    const adapter = createAgentAdapter({
      executionMode: "direct",
      provider: "hermes",
      streamingClientOptions: {
        credentialResolver
      }
    });

    expect(adapter).toBeInstanceOf(HermesAdapter);
  });

  it("returns the OpenClaw adapter when runtime streaming options are provided", () => {
    const adapter = createAgentAdapter({
      executionMode: "group",
      provider: "openclaw",
      streamingClientOptions: {
        credentialResolver
      }
    });

    expect(adapter).toBeInstanceOf(OpenClawAdapter);
  });

  it("rejects real providers when runtime streaming options are missing", () => {
    expect(() =>
      createAgentAdapter({
        executionMode: "direct",
        provider: "hermes"
      })
    ).toThrow(/streaming/i);
  });
});
