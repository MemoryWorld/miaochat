import type { AgentExecutionContext, AgentExecutionResult } from "@agenthub/agent-sdk";
import type { ProviderId } from "@agenthub/contracts";

import { createPhaseARuntimeExecution } from "./provider-runtime.js";

export type ExecuteDirectAgentActivityInput = {
  agentId: string;
  conversationId: string;
  context?: AgentExecutionContext;
  message: string;
  ownerUserId: string;
  provider: ProviderId;
  workspaceId: string;
};

export async function executeDirectAgentActivity(
  input: ExecuteDirectAgentActivityInput
): Promise<AgentExecutionResult> {
  const runtime = await createPhaseARuntimeExecution({
    executionMode: "direct",
    ownerUserId: input.ownerUserId,
    provider: input.provider,
    workspaceId: input.workspaceId
  });

  return runtime.adapter.execute({
    agentId: input.agentId,
    context: input.context,
    conversationId: input.conversationId,
    credentialId: runtime.credentialId,
    message: input.message,
    provider: runtime.provider,
    workspaceId: input.workspaceId
  });
}
