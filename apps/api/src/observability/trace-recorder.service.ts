import { Inject, Injectable } from "@nestjs/common";
import { getGlobalErrorContextStore } from "@agenthub/observability-errors";
import { OpenTelemetryRuntime } from "@agenthub/observability-otel";

import { MetricsRegistry } from "./metrics-registry.service.js";
import { StructuredLogger } from "./structured-logger.service.js";

export type TraceSpanFields = Record<string, unknown>;

export type TraceSpan = {
  end(extraFields?: TraceSpanFields): void;
  fail(error: unknown, extraFields?: TraceSpanFields): void;
  record(eventName: string, extraFields?: TraceSpanFields): void;
  spanId: string;
  traceId: string;
};

@Injectable()
export class TraceRecorder {
  constructor(
    @Inject(StructuredLogger) private readonly logger: StructuredLogger,
    @Inject(MetricsRegistry) private readonly metrics: MetricsRegistry,
    @Inject(OpenTelemetryRuntime) private readonly otel: OpenTelemetryRuntime
  ) {}

  startSpan(
    name: string,
    fields: TraceSpanFields = {},
    options: { parentTraceId?: string } = {}
  ): TraceSpan {
    const span = this.otel.startSpan(name, fields, options);
    const traceId = span.traceId;
    const spanId = span.spanId;
    const startedAt = Date.now();

    getGlobalErrorContextStore().enterWith({
      conversationId: stringOrUndefined(fields.conversationId),
      traceId,
      workspaceId:
        stringOrUndefined(fields.workspaceId) ?? stringOrUndefined(fields.workspace_id)
    });

    this.logger.info("trace.span.start", {
      ...fields,
      span: name,
      spanId,
      traceId
    });

    const finalize = (
      result: "error" | "ok",
      extraFields: TraceSpanFields,
      error?: unknown
    ): void => {
      const durationMs = Date.now() - startedAt;
      const labels = {
        result,
        span: name
      };

      this.metrics.incrementCounter("trace_span_total", labels);
      this.metrics.observeHistogram("trace_span_duration_ms", durationMs, labels);
      const finalizedFields = {
        ...fields,
        ...extraFields,
        durationMs,
        error: error instanceof Error ? error.message : error,
        result,
        span: name,
        spanId,
        traceId
      };

      if (result === "error") {
        span.fail(error, finalizedFields);
      } else {
        span.end(finalizedFields);
      }

      this.logger.info("trace.span.end", finalizedFields);
    };

    return {
      end(extraFields = {}): void {
        finalize("ok", extraFields);
      },
      fail(error, extraFields = {}): void {
        finalize("error", extraFields, error);
      },
      record: (eventName, extraFields = {}) => {
        const eventFields = {
          ...fields,
          ...extraFields,
          span: name,
          spanId,
          traceEvent: eventName,
          traceId
        };

        span.recordEvent(eventName, eventFields);
        this.metrics.incrementCounter("trace_span_event_total", {
          event: eventName,
          span: name
        });
        this.logger.info("trace.span.event", eventFields);
      },
      spanId,
      traceId
    };
  }
}

function stringOrUndefined(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
