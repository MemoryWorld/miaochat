import type { AgentExecutionContext } from "@agenthub/agent-sdk";
import { MockGroupAdapter } from "@agenthub/agent-adapters";
import type {
  OrchestratorResult,
  OrchestratorTarget
} from "@agenthub/domain/orchestration";

import { maybeThrowMockDispatchFailure } from "./failure-handling.activity.js";

const adapter = new MockGroupAdapter();

export type DispatchAgentActivityInput = OrchestratorTarget & {
  context?: AgentExecutionContext;
  conversationId: string;
  message: string;
  workspaceId: string;
};

export async function dispatchAgentActivity(
  input: DispatchAgentActivityInput
): Promise<OrchestratorResult> {
  maybeThrowMockDispatchFailure(input);

  const execution = await adapter.execute({
    agentId: input.agentId,
    context: input.context,
    conversationId: input.conversationId,
    message: input.message,
    provider: input.provider,
    workspaceId: input.workspaceId
  });

  return {
    agentId: input.agentId,
    agentName: input.agentName,
    finalContent: execution.finalContent,
    provider: input.provider
  };
}
