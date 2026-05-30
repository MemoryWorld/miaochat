import type { AgentExecutionContext, AgentExecutionResult } from "@agenthub/agent-sdk";
import type { ProviderId } from "@agenthub/contracts";
import { proxyActivities } from "@temporalio/workflow";
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
  conversationId: string;
  context?: AgentExecutionContext;
  message: string;
  ownerUserId: string;
  provider: ProviderId;
  workspaceId: string;
};

export async function singleAgentWorkflow(
  input: SingleAgentWorkflowInput
): Promise<AgentExecutionResult> {
  return executeDirectAgentActivity(input);
}
