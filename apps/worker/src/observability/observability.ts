import pino, { type Logger as PinoLogger } from "pino";
import { getGlobalErrorContextStore, getGlobalErrorCaptureSink, createCapturedError, bindUnhandledErrorMonitors } from "@agenthub/observability-errors";
import { OpenTelemetryRuntime } from "@agenthub/observability-otel";

export type LogLevel = "debug" | "error" | "info" | "warn";
export type LogFields = Record<string, unknown>;
export type MetricLabels = Record<string, string>;

const redactedPaths = [
  "authorization",
  "cookie",
  "cookies",
  "headers.authorization",
  "headers.cookie",
  "headers.set-cookie",
  "password",
  "providerSecret",
  "rawSecret",
  "secret",
  "sessionToken",
  "token"
] as const;

export class StructuredWorkerLogger {
  private readonly logger: PinoLogger;

  constructor(options: {
    logger?: PinoLogger;
    minLevel?: LogLevel;
    serviceName?: string;
    stream?: NodeJS.WritableStream;
  } = {}) {
    this.logger =
      options.logger ??
      pino(
        {
          base: {
            service: options.serviceName ?? process.env.SERVICE_NAME ?? "worker"
          },
          formatters: {
            level: (label) => ({
              level: label
            })
          },
          level: options.minLevel ?? (process.env.LOG_LEVEL as LogLevel) ?? "info",
          messageKey: "event",
          redact: {
            censor: "[Redacted]",
            paths: [...redactedPaths]
          },
          serializers: {
            err: pino.stdSerializers.err,
            error: pino.stdSerializers.err
          },
          timestamp: () => `,"ts":"${new Date().toISOString()}"`
        },
        options.stream ?? process.stdout
      );
  }

  info(event: string, fields: LogFields = {}): void {
    this.emit("info", event, fields);
  }

  warn(event: string, fields: LogFields = {}): void {
    this.emit("warn", event, fields);
  }

  error(event: string, fields: LogFields = {}): void {
    this.emit("error", event, fields);
  }

  debug(event: string, fields: LogFields = {}): void {
    this.emit("debug", event, fields);
  }

  child(extraFields: LogFields): StructuredWorkerLogger {
    return new StructuredWorkerLogger({
      logger: this.logger.child(extraFields)
    });
  }

  emit(level: LogLevel, event: string, fields: LogFields = {}): void {
    switch (level) {
      case "debug":
        this.logger.debug(fields, event);
        return;
      case "info":
        this.logger.info(fields, event);
        return;
      case "warn":
        this.logger.warn(fields, event);
        return;
      case "error":
        this.logger.error(fields, event);
        return;
    }
  }
}

type CounterEntry = {
  labels: MetricLabels;
  name: string;
  value: number;
};

type HistogramEntry = {
  count: number;
  labels: MetricLabels;
  name: string;
  sum: number;
};

export class WorkerMetricsRegistry {
  private readonly counters = new Map<string, CounterEntry>();
  private readonly histograms = new Map<string, HistogramEntry>();

  incrementCounter(name: string, labels: MetricLabels = {}, by = 1): void {
    const key = createMetricKey(name, labels);
    const existing = this.counters.get(key);

    if (existing) {
      existing.value += by;
      return;
    }

    this.counters.set(key, { labels: { ...labels }, name, value: by });
  }

  observeHistogram(name: string, value: number, labels: MetricLabels = {}): void {
    const key = createMetricKey(name, labels);
    const existing = this.histograms.get(key);

    if (existing) {
      existing.count += 1;
      existing.sum += value;
      return;
    }

    this.histograms.set(key, { count: 1, labels: { ...labels }, name, sum: value });
  }

  snapshot(): { counters: CounterEntry[]; histograms: HistogramEntry[] } {
    return {
      counters: [...this.counters.values()],
      histograms: [...this.histograms.values()]
    };
  }

  exportPrometheus(): string {
    const lines: string[] = [];

    for (const counter of this.counters.values()) {
      lines.push(`# TYPE ${counter.name} counter`);
      lines.push(`${formatMetricLine(counter.name, counter.labels)} ${counter.value}`);
    }

    for (const histogram of this.histograms.values()) {
      lines.push(`# TYPE ${histogram.name} summary`);
      lines.push(
        `${formatMetricLine(`${histogram.name}_count`, histogram.labels)} ${histogram.count}`
      );
      lines.push(
        `${formatMetricLine(`${histogram.name}_sum`, histogram.labels)} ${histogram.sum}`
      );
    }

    return `${lines.join("\n")}\n`;
  }

  reset(): void {
    this.counters.clear();
    this.histograms.clear();
  }
}

export type WorkerTraceSpan = {
  end(extraFields?: LogFields): void;
  fail(error: unknown, extraFields?: LogFields): void;
  spanId: string;
  traceId: string;
};

export class WorkerTraceRecorder {
  constructor(
    private readonly logger: StructuredWorkerLogger,
    private readonly metrics: WorkerMetricsRegistry,
    private readonly otel: OpenTelemetryRuntime
  ) {}

  startSpan(
    name: string,
    fields: LogFields = {},
    options: { parentTraceId?: string } = {}
  ): WorkerTraceSpan {
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
      extraFields: LogFields,
      error?: unknown
    ): void => {
      const durationMs = Date.now() - startedAt;
      const labels = { result, span: name };

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
      end(extraFields = {}) {
        finalize("ok", extraFields);
      },
      fail(error, extraFields = {}) {
        finalize("error", extraFields, error);
      },
      spanId,
      traceId
    };
  }
}

let cachedLogger: StructuredWorkerLogger | undefined;
let cachedMetrics: WorkerMetricsRegistry | undefined;
let cachedTracer: WorkerTraceRecorder | undefined;
let cachedOtel: OpenTelemetryRuntime | undefined;
let cachedUnbindUnhandledErrors: (() => void) | undefined;

export function getWorkerLogger(): StructuredWorkerLogger {
  cachedLogger ??= new StructuredWorkerLogger();
  return cachedLogger;
}

export function getWorkerMetrics(): WorkerMetricsRegistry {
  cachedMetrics ??= new WorkerMetricsRegistry();
  return cachedMetrics;
}

export function getWorkerTracer(): WorkerTraceRecorder {
  cachedTracer ??= new WorkerTraceRecorder(
    getWorkerLogger(),
    getWorkerMetrics(),
    getWorkerOtel()
  );
  return cachedTracer;
}

export function resetWorkerObservability(): void {
  void cachedOtel?.shutdown();
  cachedUnbindUnhandledErrors?.();
  cachedLogger = undefined;
  cachedMetrics = undefined;
  cachedTracer = undefined;
  cachedOtel = undefined;
  cachedUnbindUnhandledErrors = undefined;
}

function getWorkerOtel(): OpenTelemetryRuntime {
  cachedOtel ??= new OpenTelemetryRuntime({
    serviceName: process.env.SERVICE_NAME ?? "worker"
  });
  return cachedOtel;
}

export function bindWorkerUnhandledErrors(): () => void {
  cachedUnbindUnhandledErrors ??= bindUnhandledErrorMonitors((error, context) => {
    void getGlobalErrorCaptureSink().capture(
      createCapturedError(error, {
        ...getGlobalErrorContextStore().snapshot(),
        runtime: "worker",
        ...context
      })
    );
  });

  return cachedUnbindUnhandledErrors;
}

function stringOrUndefined(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function createMetricKey(name: string, labels: MetricLabels): string {
  const labelKey = Object.entries(labels)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join(",");

  return `${name}{${labelKey}}`;
}

function formatMetricLine(name: string, labels: MetricLabels): string {
  const labelEntries = Object.entries(labels)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}="${escapeLabel(value)}"`)
    .join(",");

  if (labelEntries.length === 0) {
    return name;
  }

  return `${name}{${labelEntries}}`;
}

function escapeLabel(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
}
