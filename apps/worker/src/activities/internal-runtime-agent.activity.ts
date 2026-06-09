import type { AgentExecutionContext, AgentExecutionResult } from "@agenthub/agent-sdk";
import { createMessageLifecycleEvents } from "@agenthub/agent-sdk";
import {
  sanitizeAssistantVisibleContent,
  sanitizeAssistantVisibleStreamEvents,
  type RuntimeBackend
} from "@agenthub/contracts";
import { parseMultiAgentOutputEnvelope } from "@agenthub/domain/multi-agent";

import { extractRuntimeArtifactDrafts } from "./artifact-drafts.js";
import {
  buildAgentHarnessInstructions,
  buildAgentHarnessRuntimeContext,
  withAgentHarnessRuntimeContext
} from "./agent-harness-instructions.js";
import { createInternalRuntimeExecution } from "./internal-runtime-registry.js";

export type ExecuteInternalRuntimeAgentActivityInput = {
  agentId: string;
  agentName?: string;
  conversationId: string;
  context?: AgentExecutionContext;
  harnessRunId?: string;
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
  const agentName = input.agentName ?? "AI 同事";
  const harness = buildAgentHarnessRuntimeContext({
    agentId: input.agentId,
    agentName,
    conversationId: input.conversationId,
    mode: "internal",
    pinnedMessageIds: input.context?.pinnedMessages.map((message) => message.id),
    runId: input.harnessRunId ?? `internal:${input.conversationId}:${input.agentId}`,
    workspaceId: input.workspaceId
  });

  const execution = await runtime.adapter.execute({
    agentId: input.agentId,
    context: withAgentHarnessRuntimeContext(input.context, harness),
    conversationId: input.conversationId,
    credentialId: runtime.credentialId,
    instructions: buildAgentHarnessInstructions({
      agentName,
      harness,
      mode: "internal"
    }),
    message: input.message,
    provider: runtime.provider,
    workspaceId: input.workspaceId
  });

  const parsedOutput = parseMultiAgentOutputEnvelope({
    rawText: execution.finalContent
  });
  const artifacts =
    parsedOutput.errors.length === 0
      ? extractRuntimeArtifactDrafts(parsedOutput.envelope)
      : [];
  const visibleContent =
    parsedOutput.errors.length === 0
      ? sanitizeAssistantVisibleContent(
          parsedOutput.envelope.visibleMessage.trim() || execution.finalContent,
          { stripCollaborationPlaceholders: true }
        )
      : sanitizeAssistantVisibleContent(execution.finalContent, {
          stripCollaborationPlaceholders: true
        });
  const hasControlEnvelope =
    parsedOutput.errors.length === 0 && parsedOutput.envelope.intents.length > 0;
  const streamEvents =
    hasControlEnvelope || (parsedOutput.errors.length === 0 && parsedOutput.extractedJson)
      ? createMessageLifecycleEvents({
          finalContent: visibleContent,
          messageId: input.conversationId
        })
      : sanitizeAssistantVisibleStreamEvents(execution.streamEvents);

  return {
    ...execution,
    ...(artifacts.length > 0 ? { artifacts } : {}),
    finalContent: visibleContent,
    streamEvents
  };
}
