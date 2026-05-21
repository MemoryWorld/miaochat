import type { AgentExecutionResult } from "@agenthub/agent-sdk";
import { MockDirectAdapter } from "@agenthub/agent-adapters";

const adapter = new MockDirectAdapter();

export type SingleAgentWorkflowInput = {
  agentId: string;
  conversationId: string;
  message: string;
  workspaceId: string;
};

export async function singleAgentWorkflow(
  input: SingleAgentWorkflowInput
): Promise<AgentExecutionResult> {
  return adapter.execute({
    ...input,
    provider: "mock"
  });
}
