import type { AgentExecutionContext, AgentExecutionResult } from "@agenthub/agent-sdk";
import type { ProviderId } from "@agenthub/contracts";

import { buildAgentHarnessInstructions } from "./agent-harness-instructions.js";
import { toTemporalActivityFailure } from "./activity-errors.js";
import { createPhaseARuntimeExecution } from "./provider-runtime.js";

export type ExecuteDirectAgentActivityInput = {
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

export async function executeDirectAgentActivity(
  input: ExecuteDirectAgentActivityInput
): Promise<AgentExecutionResult> {
  try {
    const runtime = await createPhaseARuntimeExecution({
      executionMode: "direct",
      ownerUserId: input.ownerUserId,
      provider: input.provider,
      workspaceId: input.workspaceId
    });

    return await runtime.adapter.execute({
      agentId: input.agentId,
      context: input.context,
      conversationId: input.conversationId,
      credentialId: runtime.credentialId,
      instructions: buildAgentHarnessInstructions({
        agentName: input.agentName ?? "AI 同事",
        mode: "direct",
        outputStyle: input.outputStyle,
        scopeDescription: input.scopeDescription,
        systemPrompt: input.systemPrompt
      }),
      message: input.message,
      provider: runtime.provider,
      workspaceId: input.workspaceId
    });
  } catch (error) {
    throw toTemporalActivityFailure(error);
  }
}
