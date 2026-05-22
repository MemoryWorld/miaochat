import { randomUUID } from "node:crypto";

export type LogLevel = "debug" | "error" | "info" | "warn";
export type LogFields = Record<string, unknown>;
export type MetricLabels = Record<string, string>;

const levelOrder: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40
};

export class StructuredWorkerLogger {
  private readonly minLevel: LogLevel;
  private readonly serviceName: string;
  private readonly stream: NodeJS.WritableStream;

  constructor(options: {
    minLevel?: LogLevel;
    serviceName?: string;
    stream?: NodeJS.WritableStream;
  } = {}) {
    this.serviceName = options.serviceName ?? process.env.SERVICE_NAME ?? "worker";
    this.minLevel = options.minLevel ?? (process.env.LOG_LEVEL as LogLevel) ?? "info";
    this.stream = options.stream ?? process.stdout;
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

  emit(level: LogLevel, event: string, fields: LogFields = {}): void {
    if (levelOrder[level] < levelOrder[this.minLevel]) {
      return;
    }

    const record = {
      event,
      level,
      service: this.serviceName,
      ts: new Date().toISOString(),
      ...fields
    };
    this.stream.write(`${JSON.stringify(record)}\n`);
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
    private readonly metrics: WorkerMetricsRegistry
  ) {}

  startSpan(
    name: string,
    fields: LogFields = {},
    options: { parentTraceId?: string } = {}
  ): WorkerTraceSpan {
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
      extraFields: LogFields,
      error?: unknown
    ): void => {
      const durationMs = Date.now() - startedAt;
      const labels = { result, span: name };

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

export function getWorkerLogger(): StructuredWorkerLogger {
  cachedLogger ??= new StructuredWorkerLogger();
  return cachedLogger;
}

export function getWorkerMetrics(): WorkerMetricsRegistry {
  cachedMetrics ??= new WorkerMetricsRegistry();
  return cachedMetrics;
}

export function getWorkerTracer(): WorkerTraceRecorder {
  cachedTracer ??= new WorkerTraceRecorder(getWorkerLogger(), getWorkerMetrics());
  return cachedTracer;
}

export function resetWorkerObservability(): void {
  cachedLogger = undefined;
  cachedMetrics = undefined;
  cachedTracer = undefined;
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
