import type { OrchestratorFailure } from "@agenthub/contracts";
import type {
  OrchestratorResult,
  OrchestratorTarget
} from "@agenthub/domain/orchestration";

export class MockDispatchExecutionError extends Error {
  constructor(agentName: string) {
    super(`Mock dispatch failed before completion for ${agentName}.`);
    this.name = "MockDispatchExecutionError";
  }
}

export class MockDispatchTimeoutError extends Error {
  constructor(agentName: string) {
    super(`Mock dispatch timed out before completion for ${agentName}.`);
    this.name = "MockDispatchTimeoutError";
  }
}

export function maybeThrowMockDispatchFailure(target: OrchestratorTarget): void {
  if (target.agentId.includes("timeout")) {
    throw new MockDispatchTimeoutError(target.agentName);
  }

  if (target.agentId.includes("failure") || target.agentId.includes("fail")) {
    throw new MockDispatchExecutionError(target.agentName);
  }
}

export function normalizeDispatchFailure(input: {
  error: unknown;
  target: OrchestratorTarget;
}): OrchestratorFailure {
  if (input.error instanceof MockDispatchTimeoutError) {
    return {
      agentId: input.target.agentId,
      agentName: input.target.agentName,
      code: "timeout",
      detail: input.error.message,
      provider: input.target.provider
    };
  }

  if (input.error instanceof Error) {
    return {
      agentId: input.target.agentId,
      agentName: input.target.agentName,
      code: "error",
      detail: input.error.message,
      provider: input.target.provider
    };
  }

  return {
    agentId: input.target.agentId,
    agentName: input.target.agentName,
    code: "error",
    detail: "An unknown group dispatch failure occurred.",
    provider: input.target.provider
  };
}

export async function buildPartialFailureNotice(input: {
  failures: OrchestratorFailure[];
  results: OrchestratorResult[];
  totalAgentCount: number;
}): Promise<string> {
  const summary =
    input.results.length === 0
      ? `${input.failures.length} of ${input.totalAgentCount} agents failed or timed out. No successful results remain.`
      : `${input.failures.length} of ${input.totalAgentCount} agents failed or timed out. Aggregated the remaining ${pluralize("result", input.results.length)}.`;

  return [
    "Partial failure",
    summary,
    ...input.failures.map(
      (failure) => `- ${failure.agentName} (${failure.code}): ${failure.detail}`
    )
  ].join("\n");
}

function pluralize(noun: string, count: number): string {
  return count === 1 ? noun : `${noun}s`;
}
