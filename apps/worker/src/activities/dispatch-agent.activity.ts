import type { AgentExecutionContext } from "@agenthub/agent-sdk";
import type {
  OrchestratorResult,
  OrchestratorTarget
} from "@agenthub/domain/orchestration";

import {
  getWorkerLogger,
  getWorkerMetrics,
  getWorkerTracer
} from "../observability/observability.js";
import { maybeThrowMockDispatchFailure } from "./failure-handling.activity.js";
import { createPhaseARuntimeExecution } from "./provider-runtime.js";

export type DispatchAgentActivityInput = OrchestratorTarget & {
  context?: AgentExecutionContext;
  conversationId: string;
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

    const execution = await runtime.adapter.execute({
      agentId: input.agentId,
      context: input.context,
      conversationId: input.conversationId,
      credentialId: runtime.credentialId,
      message: input.message,
      provider: runtime.provider,
      workspaceId: input.workspaceId
    });

    metrics.incrementCounter("worker_dispatch_success_total", {
      provider: input.provider
    });
    span.end({ contentLength: execution.finalContent.length });

    return {
      agentId: input.agentId,
      agentName: input.agentName,
      finalContent: execution.finalContent,
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
    span.fail(error);
    throw error;
  }
}
