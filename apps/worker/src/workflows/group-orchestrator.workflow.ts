import type { AgentExecutionContext } from "@agenthub/agent-sdk";
import { createMessageLifecycleEvents } from "@agenthub/agent-sdk";
import type { StreamEvent } from "@agenthub/contracts";
import {
  advanceOrchestratorState,
  createOrchestratorState,
  recordOrchestratorResults,
  toOrchestratorStatusEvent,
  type OrchestratorState,
  type OrchestratorTarget
} from "@agenthub/domain/orchestration";

import { aggregateResultsActivity } from "../activities/aggregate-results.activity.js";
import { dispatchAgentActivity } from "../activities/dispatch-agent.activity.js";

export type GroupOrchestratorWorkflowInput = {
  context?: AgentExecutionContext;
  conversationId: string;
  message: string;
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
  const streamEvents: StreamEvent[] = [toOrchestratorStatusEvent(state.status)];

  state = advanceOrchestratorState(state, "dispatched");
  streamEvents.push(toOrchestratorStatusEvent(state.status));

  state = advanceOrchestratorState(state, "running");
  streamEvents.push(toOrchestratorStatusEvent(state.status));

  const results = await Promise.all(
    input.targets.map((target) =>
      dispatchAgentActivity({
        ...target,
        context: input.context,
        conversationId: input.conversationId,
        message: input.message,
        workspaceId: input.workspaceId
      })
    )
  );

  state = recordOrchestratorResults(state, results);

  const finalContent = await aggregateResultsActivity({
    results: state.results
  });

  streamEvents.push(
    ...createMessageLifecycleEvents({
      finalContent,
      messageId: `${input.conversationId}:group-orchestrator`
    })
  );

  state = advanceOrchestratorState(state, "aggregated");
  streamEvents.push(toOrchestratorStatusEvent(state.status));

  return {
    finalContent,
    state,
    streamEvents
  };
}
