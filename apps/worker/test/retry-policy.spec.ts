import { describe, expect, it } from "vitest";

import {
  decideRetry,
  dispatchRetryPolicy,
  isTransientError,
  runWithRetry
} from "../src/activities/retry-policy.js";
import { resetWorkerObservability } from "../src/observability/observability.js";

describe("retryPolicy", () => {
  it("classifies timeout and rate-limit errors as transient", () => {
    expect(isTransientError(new Error("Provider timed out before completion"))).toBe(true);
    expect(isTransientError(new Error("Hit rate limit on conversation"))).toBe(true);
    expect(isTransientError(new Error("ECONNRESET while streaming"))).toBe(true);
  });

  it("classifies validation and bad-request errors as non-transient", () => {
    const validationError = Object.assign(new Error("Validation failed"), {
      name: "ZodError"
    });

    expect(isTransientError(validationError)).toBe(false);
    expect(
      isTransientError(
        Object.assign(new Error("invalid input"), { name: "BadRequestException" })
      )
    ).toBe(false);
  });

  it("scales backoff exponentially up to the maximum interval", () => {
    expect(decideRetry({ attempt: 1, error: new Error("timed out") })).toEqual(
      expect.objectContaining({ retryable: true, delayMs: 500 })
    );
    expect(decideRetry({ attempt: 2, error: new Error("timed out") })).toEqual(
      expect.objectContaining({ retryable: true, delayMs: 1_000 })
    );
    expect(decideRetry({ attempt: 3, error: new Error("timed out") })).toEqual(
      expect.objectContaining({ retryable: true, delayMs: 2_000 })
    );
    expect(decideRetry({ attempt: 6, error: new Error("timed out") })).toEqual(
      expect.objectContaining({ retryable: false })
    );
  });

  it("retries transient failures via runWithRetry until success", async () => {
    resetWorkerObservability();
    let attempts = 0;
    const sleepCalls: number[] = [];

    const result = await runWithRetry(
      async () => {
        attempts += 1;
        if (attempts < 3) {
          throw new Error("Provider timed out before completion");
        }
        return "ok";
      },
      {
        sleep: async (ms) => {
          sleepCalls.push(ms);
        },
        target: { agentId: "agent", agentName: "Agent", provider: "hermes" }
      }
    );

    expect(result).toBe("ok");
    expect(attempts).toBe(3);
    expect(sleepCalls).toEqual([500, 1_000]);
  });

  it("surfaces non-transient errors immediately without retrying", async () => {
    resetWorkerObservability();
    let attempts = 0;
    const validationError = Object.assign(new Error("Validation failed"), {
      name: "ZodError"
    });

    await expect(
      runWithRetry(
        async () => {
          attempts += 1;
          throw validationError;
        },
        {
          sleep: async () => {},
          target: { agentId: "agent", agentName: "Agent", provider: "hermes" }
        }
      )
    ).rejects.toBe(validationError);
    expect(attempts).toBe(1);
  });

  it("exposes a default policy aligned with the Temporal retry semantics", () => {
    expect(dispatchRetryPolicy).toEqual(
      expect.objectContaining({
        backoffCoefficient: 2,
        initialInterval: "500ms",
        maximumInterval: "15s",
        nonRetryableErrorTypes: expect.arrayContaining(["ZodError"])
      })
    );
  });
});
