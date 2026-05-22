import { randomUUID } from "node:crypto";

import { Inject, Injectable } from "@nestjs/common";

import { MetricsRegistry } from "./metrics-registry.service.js";
import { StructuredLogger } from "./structured-logger.service.js";

export type TraceSpanFields = Record<string, unknown>;

export type TraceSpan = {
  end(extraFields?: TraceSpanFields): void;
  fail(error: unknown, extraFields?: TraceSpanFields): void;
  spanId: string;
  traceId: string;
};

@Injectable()
export class TraceRecorder {
  constructor(
    @Inject(StructuredLogger) private readonly logger: StructuredLogger,
    @Inject(MetricsRegistry) private readonly metrics: MetricsRegistry
  ) {}

  startSpan(
    name: string,
    fields: TraceSpanFields = {},
    options: { parentTraceId?: string } = {}
  ): TraceSpan {
    const traceId = options.parentTraceId ?? randomUUID();
    const spanId = randomUUID();
    const startedAt = Date.now();

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
      this.logger.info("trace.span.end", {
        ...fields,
        ...extraFields,
        durationMs,
        error: error instanceof Error ? error.message : error,
        result,
        span: name,
        spanId,
        traceId
      });
    };

    return {
      end(extraFields = {}): void {
        finalize("ok", extraFields);
      },
      fail(error, extraFields = {}): void {
        finalize("error", extraFields, error);
      },
      spanId,
      traceId
    };
  }
}
