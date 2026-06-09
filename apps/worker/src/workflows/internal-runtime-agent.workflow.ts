import type { AgentExecutionContext, AgentExecutionResult } from "@agenthub/agent-sdk";
import type { RuntimeBackend } from "@agenthub/contracts";
import { proxyActivities, workflowInfo } from "@temporalio/workflow";

import type {
  executeInternalRuntimeAgentActivity as executeInternalRuntimeAgentActivityFn
} from "../activities/internal-runtime-agent.activity.js";

const { executeInternalRuntimeAgentActivity } = proxyActivities<{
  executeInternalRuntimeAgentActivity: typeof executeInternalRuntimeAgentActivityFn;
}>({
  retry: {
    maximumAttempts: 1
  },
  startToCloseTimeout: "1 minute"
});

export type InternalRuntimeAgentWorkflowInput = {
  agentId: string;
  agentName?: string;
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
  return executeInternalRuntimeAgentActivity({
    ...input,
    harnessRunId: workflowInfo().workflowId
  });
}
