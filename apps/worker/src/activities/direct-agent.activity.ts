import type { AgentExecutionContext, AgentExecutionResult } from "@agenthub/agent-sdk";
import { MockDirectAdapter } from "@agenthub/agent-adapters";

const adapter = new MockDirectAdapter();

export type ExecuteDirectAgentActivityInput = {
  agentId: string;
  conversationId: string;
  context?: AgentExecutionContext;
  message: string;
  workspaceId: string;
};

export async function executeDirectAgentActivity(
  input: ExecuteDirectAgentActivityInput
): Promise<AgentExecutionResult> {
  return adapter.execute({
    ...input,
    provider: "mock"
  });
}
