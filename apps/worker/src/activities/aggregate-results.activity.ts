import type { OrchestratorResult } from "@agenthub/domain/orchestration";

export type AggregateResultsActivityInput = {
  results: OrchestratorResult[];
};

export async function aggregateResultsActivity(
  input: AggregateResultsActivityInput
): Promise<string> {
  return input.results
    .map((result) => `[${result.agentName}]\n${result.finalContent}`)
    .join("\n\n");
}
