import { describe, expect, it } from "vitest";

import { formatRuntimeFailureReason } from "../src/modules/agent-runtime/runtime-error-format.js";

describe("runtime error formatting", () => {
  it("turns nested Temporal missing runtime failures into an actionable OpenCode message", () => {
    const providerFailure = {
      details: [{ code: "missing_runtime" }],
      message: "spawn opencode ENOENT"
    };
    const activityFailure = Object.assign(new Error("Activity task failed"), {
      cause: providerFailure
    });
    const workflowFailure = Object.assign(new Error("Workflow execution failed"), {
      cause: activityFailure
    });

    expect(formatRuntimeFailureReason(workflowFailure)).toBe(
      "OpenCode 运行时不可用：OpenCode CLI 未安装或 Worker PATH 不可见，请安装 OpenCode 并重启 Worker。"
    );
  });

  it("keeps a specific provider error when it is not a runtime bootstrap failure", () => {
    expect(formatRuntimeFailureReason(new Error("模型服务返回 429"))).toBe(
      "模型服务返回 429"
    );
  });
});
