import { describe, expect, it } from "vitest";

import { resolveCodingRuntimeAssignmentFromProviders } from "../src/modules/coding-workflows/coding-workflows.service.js";

describe("resolveCodingRuntimeAssignmentFromProviders", () => {
  it("uses OpenCode for legacy DeepSeek credentials instead of creating DeepSeek direct agents", () => {
    expect(resolveCodingRuntimeAssignmentFromProviders(["deepseek"])).toEqual({
      modelProfileId: null,
      provider: "opencode",
      runtimeBackend: "enhanced-hermes"
    });
  });

  it("prefers OpenCode when both OpenCode and legacy DeepSeek credentials exist", () => {
    expect(resolveCodingRuntimeAssignmentFromProviders(["deepseek", "opencode"])).toEqual({
      modelProfileId: null,
      provider: "opencode",
      runtimeBackend: "enhanced-hermes"
    });
  });
});
