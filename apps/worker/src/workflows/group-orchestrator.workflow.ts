import type { AgentExecutionContext } from "@agenthub/agent-sdk";
import { createMessageLifecycleEvents } from "@agenthub/agent-sdk";
import type { StreamEvent } from "@agenthub/contracts";
import {
  advanceOrchestratorState,
  createOrchestratorState,
  recordOrchestratorFailures,
  recordOrchestratorResults,
  toOrchestratorStatusEvent,
  type OrchestratorState,
  type OrchestratorTarget
} from "@agenthub/domain/orchestration";
import { proxyActivities } from "@temporalio/workflow";

import type {
  aggregateResultsActivity as aggregateResultsActivityFn
} from "../activities/aggregate-results.activity.js";
import type {
  dispatchAgentActivity as dispatchAgentActivityFn
} from "../activities/dispatch-agent.activity.js";
import {
  buildPartialFailureNotice,
  normalizeDispatchFailure
} from "./group-orchestrator-failure.js";

const { aggregateResultsActivity } = proxyActivities<{
  aggregateResultsActivity: typeof aggregateResultsActivityFn;
}>({
  startToCloseTimeout: "1 minute"
});

const { dispatchAgentActivity } = proxyActivities<{
  dispatchAgentActivity: typeof dispatchAgentActivityFn;
}>({
  retry: {
    backoffCoefficient: 2,
    initialInterval: "500ms",
    maximumAttempts: 5,
    maximumInterval: "15s",
    nonRetryableErrorTypes: [
      "BadRequestException",
      "MockDispatchExecutionError",
      "ZodError"
    ]
  },
  startToCloseTimeout: "1 minute"
});

export type GroupOrchestratorWorkflowInput = {
  context?: AgentExecutionContext;
  conversationId: string;
  message: string;
  ownerUserId: string;
  targets: OrchestratorTarget[];
  workspaceId: string;
};

export type GroupOrchestratorWorkflowResult = {
  finalContent: string;
  state: OrchestratorState;
  streamEvents: StreamEvent[];
};

export async function groupOrchestratorWorkflow(
  input: GroupOrchestratorWorkflowInput
): Promise<GroupOrchestratorWorkflowResult> {
  if (input.targets.length === 0) {
    throw new Error("The orchestrator requires at least one target agent.");
  }

  let state = createOrchestratorState({
    conversationId: input.conversationId,
    message: input.message,
    targets: input.targets,
    workspaceId: input.workspaceId
  });
  const streamEvents: StreamEvent[] = [toOrchestratorStatusEvent(state)];

  state = advanceOrchestratorState(state, "dispatched");
  streamEvents.push(toOrchestratorStatusEvent(state));

  state = advanceOrchestratorState(state, "running");
  streamEvents.push(toOrchestratorStatusEvent(state));

  const settledResults = await Promise.all(
    input.targets.map((target) =>
      dispatchAgentActivity({
        ...target,
        context: input.context,
        conversationId: input.conversationId,
        message: input.message,
        ownerUserId: input.ownerUserId,
        workspaceId: input.workspaceId
      })
        .then((result) => ({
          result,
          target
        }))
        .catch((error: unknown) => ({
          error,
          target
        }))
    )
  );

  const results = settledResults.flatMap((entry) =>
    "result" in entry ? [entry.result] : []
  );
  const failures = settledResults.flatMap((entry) =>
    "error" in entry
      ? [
          normalizeDispatchFailure({
            error: entry.error,
            target: entry.target
          })
        ]
      : []
  );

  state = recordOrchestratorResults(state, results);

  if (failures.length > 0) {
    state = recordOrchestratorFailures(state, failures);
    state = advanceOrchestratorState(state, "partial_failure");
    streamEvents.push(toOrchestratorStatusEvent(state));
  }

  const aggregatedContent =
    state.results.length > 0
      ? await aggregateResultsActivity({
          results: state.results
        })
      : "";
  const partialFailureNotice =
    failures.length > 0
      ? buildPartialFailureNotice({
          failures: state.failures,
          results: state.results,
          totalAgentCount: state.targets.length
        })
      : "";
  const finalContent = [aggregatedContent, partialFailureNotice]
    .filter((section) => section.length > 0)
    .join("\n\n");

  streamEvents.push(
    ...createMessageLifecycleEvents({
      finalContent,
      messageId: `${input.conversationId}:group-orchestrator`
    })
  );

  state = advanceOrchestratorState(state, "aggregated");
  streamEvents.push(toOrchestratorStatusEvent(state));

  return {
    finalContent,
    state,
    streamEvents
  };
}
