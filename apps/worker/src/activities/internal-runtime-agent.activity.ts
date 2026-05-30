import type { AgentExecutionContext, AgentExecutionResult } from "@agenthub/agent-sdk";
import type { RuntimeBackend } from "@agenthub/contracts";

import { createInternalRuntimeExecution } from "./internal-runtime-registry.js";

export type ExecuteInternalRuntimeAgentActivityInput = {
  agentId: string;
  conversationId: string;
  context?: AgentExecutionContext;
  message: string;
  ownerUserId: string;
  runtimeBackend: RuntimeBackend;
  workspaceId: string;
};

export async function executeInternalRuntimeAgentActivity(
  input: ExecuteInternalRuntimeAgentActivityInput
): Promise<AgentExecutionResult> {
  const runtime = await createInternalRuntimeExecution({
    executionMode: "direct",
    ownerUserId: input.ownerUserId,
    runtimeBackend: input.runtimeBackend,
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
