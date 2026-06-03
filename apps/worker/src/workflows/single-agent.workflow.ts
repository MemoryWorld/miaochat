import type { AgentExecutionContext, AgentExecutionResult } from "@agenthub/agent-sdk";
import type { ProviderId } from "@agenthub/contracts";
import { proxyActivities, workflowInfo } from "@temporalio/workflow";
import type {
  executeDirectAgentActivity as executeDirectAgentActivityFn
} from "../activities/direct-agent.activity.js";

const { executeDirectAgentActivity } = proxyActivities<{
  executeDirectAgentActivity: typeof executeDirectAgentActivityFn;
}>({
  retry: {
    backoffCoefficient: 2,
    initialInterval: "500ms",
    maximumAttempts: 5,
    maximumInterval: "15s",
    nonRetryableErrorTypes: [
      "BadRequestException",
      "ProviderCredentialError",
      "ZodError"
    ]
  },
  startToCloseTimeout: "5 minutes"
});

export type SingleAgentWorkflowInput = {
  agentId: string;
  agentName?: string;
  conversationId: string;
  context?: AgentExecutionContext;
  message: string;
  ownerUserId: string;
  outputStyle?: string | null;
  provider: ProviderId;
  scopeDescription?: string | null;
  systemPrompt?: string | null;
  workspaceId: string;
};

export async function singleAgentWorkflow(
  input: SingleAgentWorkflowInput
): Promise<AgentExecutionResult> {
  return executeDirectAgentActivity({
    ...input,
    harnessRunId: workflowInfo().workflowId
  });
}
