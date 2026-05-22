import type { OrchestratorTarget } from "@agenthub/domain/orchestration";

import { getWorkerLogger, getWorkerMetrics } from "../observability/observability.js";

/**
 * Temporal-style retry policy describing how the worker should retry transient
 * provider failures. The constants mirror the strings the Temporal SDK accepts
 * so the same shape can be passed straight into `proxyActivities` configuration.
 */
export type ActivityRetryPolicy = {
  backoffCoefficient: number;
  initialInterval: string;
  maximumAttempts: number;
  maximumInterval: string;
  nonRetryableErrorTypes: string[];
};

export const dispatchRetryPolicy: ActivityRetryPolicy = {
  backoffCoefficient: 2,
  initialInterval: "500ms",
  maximumAttempts: Number(process.env.WORKER_DISPATCH_MAX_ATTEMPTS ?? 5),
  maximumInterval: "15s",
  nonRetryableErrorTypes: [
    "BadRequestException",
    "MockDispatchExecutionError",
    "ZodError"
  ]
};

export type RetryDecision = {
  attempt: number;
  delayMs: number;
  retryable: boolean;
};

export function isTransientError(error: unknown): boolean {
  if (error instanceof Error) {
    const name = error.name.toLowerCase();
    const message = error.message.toLowerCase();

    if (dispatchRetryPolicy.nonRetryableErrorTypes.some((type) => name.includes(type.toLowerCase()))) {
      return false;
    }

    if (name.includes("timeout") || message.includes("timed out")) {
      return true;
    }

    if (message.includes("rate limit") || message.includes("temporary")) {
      return true;
    }

    if (message.includes("connection") || message.includes("econnreset")) {
      return true;
    }
  }

  return false;
}

export function decideRetry(input: {
  attempt: number;
  error: unknown;
  policy?: ActivityRetryPolicy;
}): RetryDecision {
  const policy = input.policy ?? dispatchRetryPolicy;
  const attempt = Math.max(1, input.attempt);

  if (attempt >= policy.maximumAttempts) {
    return { attempt, delayMs: 0, retryable: false };
  }

  if (!isTransientError(input.error)) {
    return { attempt, delayMs: 0, retryable: false };
  }

  const initialMs = parseDuration(policy.initialInterval);
  const maximumMs = parseDuration(policy.maximumInterval);
  const exponential = initialMs * policy.backoffCoefficient ** (attempt - 1);

  return {
    attempt,
    delayMs: Math.min(exponential, maximumMs),
    retryable: true
  };
}

/**
 * Wrap an activity body with the dispatch retry policy. Used by tests and by
 * activities that opt into the in-process retry helper while the Temporal SDK
 * retry policy is configured at workflow level.
 */
export async function runWithRetry<T>(
  task: () => Promise<T>,
  options: {
    onRetry?: (decision: RetryDecision, error: unknown) => void;
    policy?: ActivityRetryPolicy;
    sleep?: (ms: number) => Promise<void>;
    target?: Pick<OrchestratorTarget, "agentId" | "agentName" | "provider">;
  } = {}
): Promise<T> {
  const policy = options.policy ?? dispatchRetryPolicy;
  const sleep = options.sleep ?? defaultSleep;
  const logger = getWorkerLogger();
  const metrics = getWorkerMetrics();
  let attempt = 0;

  while (true) {
    attempt += 1;

    try {
      return await task();
    } catch (error) {
      const decision = decideRetry({ attempt, error, policy });

      if (!decision.retryable) {
        metrics.incrementCounter("worker_retry_exhausted_total", {
          provider: options.target?.provider ?? "unknown"
        });
        throw error;
      }

      metrics.incrementCounter("worker_retry_total", {
        provider: options.target?.provider ?? "unknown"
      });
      logger.warn("worker.retry", {
        agentId: options.target?.agentId,
        attempt: decision.attempt,
        delayMs: decision.delayMs,
        error: error instanceof Error ? error.message : String(error),
        provider: options.target?.provider
      });
      options.onRetry?.(decision, error);

      await sleep(decision.delayMs);
    }
  }
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseDuration(value: string): number {
  const match = value.trim().match(/^(\d+(?:\.\d+)?)\s*(ms|s|m|h)?$/i);

  if (!match) {
    throw new Error(`Invalid retry duration: ${value}`);
  }

  const amount = Number(match[1]);
  const unit = (match[2] ?? "ms").toLowerCase();

  switch (unit) {
    case "ms":
      return amount;
    case "s":
      return amount * 1_000;
    case "m":
      return amount * 60_000;
    case "h":
      return amount * 3_600_000;
    default:
      throw new Error(`Unsupported retry duration unit: ${unit}`);
  }
}
