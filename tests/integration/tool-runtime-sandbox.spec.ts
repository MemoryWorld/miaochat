import { describe, expect, it, vi } from "vitest";

import {
  DEFAULT_RESOURCE_POLICY,
  runSandboxed,
  ToolRuntimeError,
  tierResourcePolicy
} from "../../packages/tool-runtime/src/index.js";

describe("tool runtime sandbox", () => {
  it("completes a fast handler and reports observability metrics", async () => {
    const observe = vi.fn();
    const result = await runSandboxed({
      handler: async () => "ok",
      observability: observe,
      toolName: "noop"
    });

    expect(result.result).toBe("ok");
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(observe).toHaveBeenCalledWith(
      expect.objectContaining({ result: "completed", toolName: "noop" })
    );
  });

  it("aborts handlers that exceed the timeout policy", async () => {
    const observe = vi.fn();
    await expect(
      runSandboxed({
        handler: ({ abortSignal }) =>
          new Promise((_, reject) => {
            abortSignal.addEventListener("abort", () => {
              reject(new Error("aborted from handler"));
            });
          }),
        observability: observe,
        policy: { timeoutMs: 25 },
        toolName: "slow"
      })
    ).rejects.toMatchObject({
      publicCode: "tool_timeout"
    });

    expect(observe).toHaveBeenCalledWith(
      expect.objectContaining({ result: "timed_out", toolName: "slow" })
    );
  });

  it("rejects payloads larger than the configured cap", async () => {
    await expect(
      runSandboxed({
        handler: async () => "x".repeat(10),
        policy: { maxOutputBytes: 4 },
        toolName: "verbose"
      })
    ).rejects.toBeInstanceOf(ToolRuntimeError);
  });

  it("provides tiered policies", () => {
    expect(tierResourcePolicy("trusted").networkAllowed).toBe(true);
    expect(tierResourcePolicy("interactive")).toEqual(DEFAULT_RESOURCE_POLICY);
  });
});
