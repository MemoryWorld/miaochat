import type { AgentExecutionContext } from "@agenthub/agent-sdk";
import type {
  OrchestratorResult,
  OrchestratorTarget
} from "@agenthub/domain/orchestration";
import { sanitizeAssistantVisibleContent } from "@agenthub/contracts";
import { parseMultiAgentOutputEnvelope } from "@agenthub/domain/multi-agent";

import {
  getWorkerLogger,
  getWorkerMetrics,
  getWorkerTracer
} from "../observability/observability.js";
import {
  type AgentCollaborationStepInstruction,
  buildAgentHarnessInstructions,
  buildAgentHarnessRuntimeContext,
  withAgentHarnessRuntimeContext
} from "./agent-harness-instructions.js";
import { toTemporalActivityFailure } from "./activity-errors.js";
import { maybeThrowMockDispatchFailure } from "./failure-handling.activity.js";
import { createPhaseARuntimeExecution } from "./provider-runtime.js";

export type DispatchAgentActivityInput = OrchestratorTarget & {
  collaborationStep?: AgentCollaborationStepInstruction;
  context?: AgentExecutionContext;
  conversationId: string;
  harnessRunId?: string;
  message: string;
  ownerUserId: string;
  workspaceId: string;
};

export async function dispatchAgentActivity(
  input: DispatchAgentActivityInput
): Promise<OrchestratorResult> {
  const tracer = getWorkerTracer();
  const metrics = getWorkerMetrics();
  const logger = getWorkerLogger();
  const span = tracer.startSpan("worker.dispatch_agent", {
    agentId: input.agentId,
    conversationId: input.conversationId,
    provider: input.provider,
    workspaceId: input.workspaceId
  });
  metrics.incrementCounter("worker_dispatch_total", { provider: input.provider });

  try {
    maybeThrowMockDispatchFailure(input);
    const runtime = await createPhaseARuntimeExecution({
      executionMode: "group",
      ownerUserId: input.ownerUserId,
      provider: input.provider,
      workspaceId: input.workspaceId
    });
    const harness = buildAgentHarnessRuntimeContext({
      agentId: input.agentId,
      agentName: input.agentName,
      conversationId: input.conversationId,
      mode: "group",
      pinnedMessageIds: input.context?.pinnedMessages.map((message) => message.id),
      runId: input.harnessRunId ?? `group:${input.conversationId}:${input.agentId}`,
      workspaceId: input.workspaceId
    });

    const execution = await runtime.adapter.execute({
      agentId: input.agentId,
      context: withAgentHarnessRuntimeContext(input.context, harness),
      conversationId: input.conversationId,
      credentialId: runtime.credentialId,
      instructions: buildAgentHarnessInstructions({
        agentName: input.agentName,
        collaborationStep: input.collaborationStep,
        harness,
        mode: "group",
        outputStyle: input.outputStyle,
        scopeDescription: input.scopeDescription,
        systemPrompt: input.systemPrompt
      }),
      message: input.message,
      provider: runtime.provider,
      workspaceId: input.workspaceId
    });

    const parsedOutput = parseMultiAgentOutputEnvelope({
      rawText: execution.finalContent
    });
    const visibleContent =
      parsedOutput.errors.length === 0
        ? sanitizeAssistantVisibleContent(
            parsedOutput.envelope.visibleMessage.trim() || execution.finalContent,
            { stripCollaborationPlaceholders: true }
          )
        : sanitizeAssistantVisibleContent(execution.finalContent, {
            stripCollaborationPlaceholders: true
          });

    metrics.incrementCounter("worker_dispatch_success_total", {
      provider: input.provider
    });
    span.end({ contentLength: visibleContent.length });

    return {
      agentId: input.agentId,
      agentName: input.agentName,
      finalContent: visibleContent,
      ...(parsedOutput.errors.length === 0
        ? { harnessOutput: parsedOutput.envelope }
        : {}),
      provider: input.provider
    };
  } catch (error) {
    metrics.incrementCounter("worker_dispatch_error_total", {
      provider: input.provider
    });
    logger.error("worker.dispatch_agent.failed", {
      agentId: input.agentId,
      conversationId: input.conversationId,
      error: error instanceof Error ? error.message : String(error),
      provider: input.provider,
      workspaceId: input.workspaceId
    });
    const activityFailure = toTemporalActivityFailure(error);
    span.fail(activityFailure);
    throw activityFailure;
  }
}
