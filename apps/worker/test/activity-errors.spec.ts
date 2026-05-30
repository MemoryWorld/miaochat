import { AgentAdapterError } from "@agenthub/agent-sdk";
import { ApplicationFailure } from "@temporalio/client";
import { describe, expect, it } from "vitest";

import {
  ProviderCredentialError,
  toTemporalActivityFailure
} from "../src/activities/activity-errors.js";

describe("activityErrors", () => {
  it("marks missing provider credentials as non-retryable activity failures", () => {
    const failure = toTemporalActivityFailure(
      new ProviderCredentialError("No valid BYOK credential found.")
    );

    expect(failure).toBeInstanceOf(ApplicationFailure);
    expect((failure as ApplicationFailure).nonRetryable).toBe(true);
    expect((failure as ApplicationFailure).type).toBe("ProviderCredentialError");
  });

  it("marks non-retryable adapter errors as non-retryable activity failures", () => {
    const failure = toTemporalActivityFailure(
      new AgentAdapterError("模型连接不可用，请在设置中检查 API Key。", {
        code: "provider_failed",
        retryable: false
      })
    );

    expect(failure).toBeInstanceOf(ApplicationFailure);
    expect((failure as ApplicationFailure).nonRetryable).toBe(true);
    expect((failure as ApplicationFailure).type).toBe("AgentAdapterError");
  });

  it("keeps retryable adapter errors retryable for Temporal", () => {
    const error = new AgentAdapterError("模型服务暂时繁忙，请稍后重试。", {
      code: "provider_failed",
      retryable: true
    });

    expect(toTemporalActivityFailure(error)).toBe(error);
  });
});
