import type { OrchestratorFailure } from "@agenthub/contracts";
import type {
  OrchestratorResult,
  OrchestratorTarget
} from "@agenthub/domain/orchestration";

export function normalizeDispatchFailure(input: {
  error: unknown;
  target: OrchestratorTarget;
}): OrchestratorFailure {
  return {
    agentId: input.target.agentId,
    agentName: input.target.agentName,
    code: input.target.agentId.includes("timeout") ? "timeout" : "error",
    detail: humanizeFailureDetail(unwrapFailureDetail(input.error)),
    provider: input.target.provider
  };
}

/**
 * Temporal 把 activity 失败包成 ActivityFailure（message 固定为
 * "Activity task failed"），真实原因藏在 cause 链最深处。
 */
function unwrapFailureDetail(error: unknown): string {
  const shellMessagePattern = /^(activity task failed|workflow execution failed|activity failure)/i;
  let current: unknown = error;
  let detail = "";

  while (current instanceof Error) {
    const message = current.message.trim();

    if (message && !shellMessagePattern.test(message)) {
      detail = message;
    }

    current = current.cause;
  }

  if (detail) {
    return detail;
  }

  return error instanceof Error && error.message.trim()
    ? error.message
    : "An unknown group dispatch failure occurred.";
}

function humanizeFailureDetail(detail: string): string {
  if (/no valid byok credential|providercredentialerror|missing_credential|请先在设置中连接/i.test(detail)) {
    return "未配置可用的模型连接，请在「设置 → 模型连接」中完成配置后重试。";
  }

  return detail;
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
