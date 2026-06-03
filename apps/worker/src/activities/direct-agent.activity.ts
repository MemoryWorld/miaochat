import type { AgentExecutionContext, AgentExecutionResult } from "@agenthub/agent-sdk";
import {
  sanitizeAssistantVisibleContent,
  sanitizeAssistantVisibleStreamEvents,
  type ProviderId
} from "@agenthub/contracts";

import {
  buildAgentHarnessInstructions,
  buildAgentHarnessRuntimeContext,
  withAgentHarnessRuntimeContext
} from "./agent-harness-instructions.js";
import { toTemporalActivityFailure } from "./activity-errors.js";
import { createPhaseARuntimeExecution } from "./provider-runtime.js";

export type ExecuteDirectAgentActivityInput = {
  agentId: string;
  agentName?: string;
  conversationId: string;
  context?: AgentExecutionContext;
  harnessRunId?: string;
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
    const harness = buildAgentHarnessRuntimeContext({
      agentId: input.agentId,
      agentName: input.agentName ?? "AI 同事",
      conversationId: input.conversationId,
      mode: "direct",
      pinnedMessageIds: input.context?.pinnedMessages.map((message) => message.id),
      runId: input.harnessRunId ?? `direct:${input.conversationId}:${input.agentId}`,
      workspaceId: input.workspaceId
    });

    const execution = await runtime.adapter.execute({
      agentId: input.agentId,
      context: withAgentHarnessRuntimeContext(input.context, harness),
      conversationId: input.conversationId,
      credentialId: runtime.credentialId,
      instructions: buildAgentHarnessInstructions({
        agentName: input.agentName ?? "AI 同事",
        harness,
        mode: "direct",
        outputStyle: input.outputStyle,
        scopeDescription: input.scopeDescription,
        systemPrompt: input.systemPrompt
      }),
      message: input.message,
      provider: runtime.provider,
      workspaceId: input.workspaceId
    });

    return {
      ...execution,
      finalContent: sanitizeAssistantVisibleContent(execution.finalContent),
      streamEvents: sanitizeAssistantVisibleStreamEvents(execution.streamEvents)
    };
  } catch (error) {
    throw toTemporalActivityFailure(error);
  }
}
