import type { AgentExecutionContext, AgentExecutionResult } from "@agenthub/agent-sdk";
import type { RuntimeBackend } from "@agenthub/contracts";
import { proxyActivities } from "@temporalio/workflow";

import type {
  executeInternalRuntimeAgentActivity as executeInternalRuntimeAgentActivityFn
} from "../activities/internal-runtime-agent.activity.js";

const { executeInternalRuntimeAgentActivity } = proxyActivities<{
  executeInternalRuntimeAgentActivity: typeof executeInternalRuntimeAgentActivityFn;
}>({
  startToCloseTimeout: "1 minute"
});

export type InternalRuntimeAgentWorkflowInput = {
  agentId: string;
  conversationId: string;
  context?: AgentExecutionContext;
  message: string;
  ownerUserId: string;
  runtimeBackend: RuntimeBackend;
  workspaceId: string;
};

export async function internalRuntimeAgentWorkflow(
  input: InternalRuntimeAgentWorkflowInput
): Promise<AgentExecutionResult> {
  return executeInternalRuntimeAgentActivity(input);
}
