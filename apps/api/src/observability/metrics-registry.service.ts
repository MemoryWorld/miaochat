import { Injectable } from "@nestjs/common";

export type MetricLabels = Record<string, string>;

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

@Injectable()
export class MetricsRegistry {
  private readonly counters = new Map<string, CounterEntry>();
  private readonly histograms = new Map<string, HistogramEntry>();

  incrementCounter(name: string, labels: MetricLabels = {}, by = 1): void {
    const key = createMetricKey(name, labels);
    const existing = this.counters.get(key);

    if (existing) {
      existing.value += by;
      return;
    }

    this.counters.set(key, {
      labels: { ...labels },
      name,
      value: by
    });
  }

  observeHistogram(name: string, value: number, labels: MetricLabels = {}): void {
    const key = createMetricKey(name, labels);
    const existing = this.histograms.get(key);

    if (existing) {
      existing.count += 1;
      existing.sum += value;
      return;
    }

    this.histograms.set(key, {
      count: 1,
      labels: { ...labels },
      name,
      sum: value
    });
  }

  snapshot(): {
    counters: CounterEntry[];
    histograms: HistogramEntry[];
  } {
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
