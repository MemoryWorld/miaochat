import { randomBytes } from "node:crypto";

import {
  SpanStatusCode,
  context,
  trace,
  type Attributes,
  type Context
} from "@opentelemetry/api";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { Resource } from "@opentelemetry/resources";
import {
  BasicTracerProvider,
  BatchSpanProcessor,
  SimpleSpanProcessor,
  type SpanExporter
} from "@opentelemetry/sdk-trace-base";
import { SemanticResourceAttributes } from "@opentelemetry/semantic-conventions";

export type TraceAttributes = Record<string, unknown>;

export type OpenTelemetryRuntimeOptions = {
  exporter?: SpanExporter;
  exporterUrl?: string;
  serviceName: string;
  useSimpleProcessor?: boolean;
};

export type OpenTelemetrySpan = {
  end(extraAttributes?: TraceAttributes): void;
  fail(error: unknown, extraAttributes?: TraceAttributes): void;
  spanId: string;
  traceId: string;
};

export class OpenTelemetryRuntime {
  private readonly provider: BasicTracerProvider;
  private readonly tracer;

  constructor(private readonly options: OpenTelemetryRuntimeOptions) {
    this.provider = new BasicTracerProvider({
      resource: new Resource({
        [SemanticResourceAttributes.SERVICE_NAME]: this.serviceName
      })
    });
    this.tracer = this.provider.getTracer(this.serviceName);

    const exporter = options.exporter ?? createDefaultExporter(options.exporterUrl);
    if (exporter) {
      const processor = options.useSimpleProcessor
        ? new SimpleSpanProcessor(exporter)
        : new BatchSpanProcessor(exporter);
      this.provider.addSpanProcessor(processor);
    }
  }

  get serviceName(): string {
    return this.options.serviceName;
  }

  startSpan(
    name: string,
    attributes: TraceAttributes = {},
    options: { parentTraceId?: string } = {}
  ): OpenTelemetrySpan {
    const parentContext = options.parentTraceId
      ? createRemoteParentContext(options.parentTraceId)
      : undefined;
    const span = this.tracer.startSpan(name, undefined, parentContext);

    span.setAttributes(toAttributes(attributes));

    const { spanId, traceId } = span.spanContext();

    return {
      end: (extraAttributes = {}) => {
        span.setAttributes(toAttributes(extraAttributes));
        span.setStatus({
          code: SpanStatusCode.OK
        });
        span.end();
      },
      fail: (error, extraAttributes = {}) => {
        span.setAttributes(toAttributes(extraAttributes));
        if (error instanceof Error) {
          span.recordException(error);
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: error.message
          });
        } else {
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: String(error)
          });
        }
        span.end();
      },
      spanId,
      traceId
    };
  }

  async shutdown(): Promise<void> {
    await this.provider.forceFlush();
    await this.provider.shutdown();
  }
}

function createDefaultExporter(exporterUrl?: string): SpanExporter | undefined {
  const url =
    exporterUrl ??
    process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT ??
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT;

  if (!url) {
    return undefined;
  }

  return new OTLPTraceExporter({
    url
  });
}

function createRemoteParentContext(parentTraceId: string): Context {
  const traceId = normalizeTraceId(parentTraceId);

  return trace.setSpan(
    context.active(),
    trace.wrapSpanContext({
      isRemote: true,
      spanId: randomBytes(8).toString("hex"),
      traceFlags: 0x01,
      traceId
    })
  );
}

function normalizeTraceId(value: string): string {
  const normalized = value.replace(/[^a-fA-F0-9]/g, "").toLowerCase();

  if (normalized.length >= 32) {
    return normalized.slice(0, 32);
  }

  return normalized.padStart(32, "0");
}

function toAttributes(input: TraceAttributes): Attributes {
  const attributes: Attributes = {};

  for (const [key, value] of Object.entries(input)) {
    const normalized = toAttributeValue(value);
    if (normalized !== undefined) {
      attributes[key] = normalized;
    }
  }

  return attributes;
}

function toAttributeValue(value: unknown): Attributes[string] | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value instanceof Error) {
    return value.message;
  }

  if (Array.isArray(value)) {
    const normalized = value
      .map((entry) => toAttributeValue(entry))
      .filter((entry): entry is NonNullable<typeof entry> => entry !== undefined);

    if (normalized.length === 0) {
      return undefined;
    }

    if (normalized.every((entry) => typeof entry === "string")) {
      return normalized;
    }

    if (normalized.every((entry) => typeof entry === "number")) {
      return normalized;
    }

    if (normalized.every((entry) => typeof entry === "boolean")) {
      return normalized;
    }

    return normalized.map((entry) => String(entry));
  }

  return JSON.stringify(value);
}
