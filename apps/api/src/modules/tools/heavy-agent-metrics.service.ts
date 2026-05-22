import { Inject, Injectable } from "@nestjs/common";

import { MetricsRegistry } from "../../observability/metrics-registry.service.js";
import { TraceRecorder } from "../../observability/trace-recorder.service.js";
import { WorkspaceAuditService } from "../workspaces/audit.service.js";

export type HeavyAgentExecutionEvent = {
  agentId: string;
  coldStart: boolean;
  durationMs: number;
  outcome: "completed" | "quota_exceeded" | "failed";
  toolInvocations: number;
  workspaceId: string;
  workspaceOwnerUserId: string;
};

@Injectable()
export class HeavyAgentMetricsService {
  constructor(
    @Inject(WorkspaceAuditService)
    private readonly audit: WorkspaceAuditService,
    @Inject(MetricsRegistry)
    private readonly metrics: MetricsRegistry,
    @Inject(TraceRecorder)
    private readonly trace: TraceRecorder
  ) {}

  recordExecution(event: HeavyAgentExecutionEvent): void {
    this.metrics.incrementCounter("heavy_agent_execution_total", {
      agent_id: event.agentId,
      outcome: event.outcome,
      workspace_id: event.workspaceId
    });

    this.metrics.observeHistogram(
      "heavy_agent_execution_duration_ms",
      event.durationMs,
      { agent_id: event.agentId, outcome: event.outcome }
    );

    if (event.coldStart) {
      this.metrics.incrementCounter("heavy_agent_cold_start_total", {
        agent_id: event.agentId
      });
    }

    if (event.toolInvocations > 0) {
      this.metrics.incrementCounter(
        "heavy_agent_tool_invocation_total",
        { agent_id: event.agentId, workspace_id: event.workspaceId },
        event.toolInvocations
      );
    }

    if (event.outcome === "quota_exceeded") {
      this.metrics.incrementCounter("heavy_agent_quota_exceeded_total", {
        agent_id: event.agentId,
        workspace_id: event.workspaceId
      });
    }

    const span = this.trace.startSpan("heavy_agent.execution", {
      agentId: event.agentId,
      coldStart: event.coldStart,
      outcome: event.outcome,
      toolInvocations: event.toolInvocations,
      workspaceId: event.workspaceId
    });
    if (event.outcome === "completed") {
      span.end({ durationMs: event.durationMs });
    } else {
      span.fail(new Error(event.outcome), { durationMs: event.durationMs });
    }
  }

  async recordRegistration(input: {
    actorUserId: string;
    agentId: string;
    workspaceId: string;
    workspaceOwnerUserId: string;
  }): Promise<void> {
    this.metrics.incrementCounter("heavy_agent_registration_total", {
      workspace_id: input.workspaceId
    });
    await this.audit.append({
      action: "conversation.share",
      actorUserId: input.actorUserId,
      details: {
        agentId: input.agentId,
        kind: "heavy_agent.registration"
      },
      resourceId: input.agentId,
      resourceType: "custom_agent",
      workspaceId: input.workspaceId,
      workspaceOwnerUserId: input.workspaceOwnerUserId
    });
  }
}
