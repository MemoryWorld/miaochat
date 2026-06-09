import { describe, expect, it } from "vitest";

import {
  isBuiltInPreferredRuntime,
  isCompatibilityRuntime,
  resolveRuntimeBackendProvider
} from "../src/activities/internal-runtime-registry.js";

describe("internal runtime registry", () => {
  it("maps the preferred built-in backend to the OpenCode model connection path", () => {
    expect(resolveRuntimeBackendProvider("enhanced-hermes")).toBe("opencode");
    expect(isBuiltInPreferredRuntime("enhanced-hermes")).toBe(true);
    expect(isCompatibilityRuntime("enhanced-hermes")).toBe(false);
  });

  it("maps compatibility runtimes to their provider transports", () => {
    expect(resolveRuntimeBackendProvider("hermes-compat")).toBe("hermes");
    expect(resolveRuntimeBackendProvider("openclaw-compat")).toBe("openclaw");
    expect(isCompatibilityRuntime("hermes-compat")).toBe(true);
    expect(isCompatibilityRuntime("openclaw-compat")).toBe(true);
  });

  it("keeps mock available for tests and blocks the future Claude internal backend", () => {
    expect(resolveRuntimeBackendProvider("mock")).toBe("mock");
    expect(() => resolveRuntimeBackendProvider("claude-code-internal")).toThrow(
      /unavailable in this release/i
    );
  });
});
