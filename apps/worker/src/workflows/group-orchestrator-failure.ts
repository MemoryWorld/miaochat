import type { OrchestratorFailure } from "@agenthub/contracts";
import type {
  OrchestratorResult,
  OrchestratorTarget
} from "@agenthub/domain/orchestration";

export function normalizeDispatchFailure(input: {
  error: unknown;
  target: OrchestratorTarget;
}): OrchestratorFailure {
  const detail =
    input.error instanceof Error
      ? input.error.message
      : "An unknown group dispatch failure occurred.";

  return {
    agentId: input.target.agentId,
    agentName: input.target.agentName,
    code: input.target.agentId.includes("timeout") ? "timeout" : "error",
    detail,
    provider: input.target.provider
  };
}

export function buildPartialFailureNotice(input: {
  failures: OrchestratorFailure[];
  results: OrchestratorResult[];
  totalAgentCount: number;
}): string {
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
