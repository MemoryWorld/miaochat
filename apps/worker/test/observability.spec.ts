import { Writable } from "node:stream";

import { afterEach, describe, expect, it } from "vitest";

import {
  StructuredWorkerLogger,
  WorkerMetricsRegistry,
  WorkerTraceRecorder,
  resetWorkerObservability
} from "../src/observability/observability.js";

class CapturingStream extends Writable {
  readonly entries: string[] = [];

  override _write(
    chunk: Buffer | string,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void
  ): void {
    this.entries.push(chunk.toString("utf8"));
    callback();
  }
}

describe("worker observability", () => {
  afterEach(() => {
    resetWorkerObservability();
  });

  it("emits structured worker log lines", () => {
    const stream = new CapturingStream();
    const logger = new StructuredWorkerLogger({
      minLevel: "info",
      serviceName: "worker-test",
      stream
    });

    logger.info("worker.dispatch_agent.started", {
      agentId: "agent_obs",
      provider: "mock"
    });
    logger.warn("worker.dispatch_agent.retry", {
      agentId: "agent_obs",
      provider: "mock"
    });

    const decoded = stream.entries.map((entry) => JSON.parse(entry));

    expect(decoded).toEqual([
      expect.objectContaining({
        agentId: "agent_obs",
        event: "worker.dispatch_agent.started",
        level: "info",
        provider: "mock",
        service: "worker-test"
      }),
      expect.objectContaining({
        event: "worker.dispatch_agent.retry",
        level: "warn"
      })
    ]);
  });

  it("records counters and observations through the metrics registry", () => {
    const registry = new WorkerMetricsRegistry();

    registry.incrementCounter("worker_dispatch_total", { provider: "mock" });
    registry.incrementCounter("worker_dispatch_total", { provider: "mock" });
    registry.observeHistogram("trace_span_duration_ms", 30, { span: "dispatch" });

    expect(registry.snapshot().counters).toEqual([
      {
        labels: { provider: "mock" },
        name: "worker_dispatch_total",
        value: 2
      }
    ]);
    expect(registry.exportPrometheus()).toContain("worker_dispatch_total");
  });

  it("traces success and failure spans through the worker recorder", () => {
    const stream = new CapturingStream();
    const logger = new StructuredWorkerLogger({
      minLevel: "info",
      serviceName: "worker-test",
      stream
    });
    const metrics = new WorkerMetricsRegistry();
    const tracer = new WorkerTraceRecorder(logger, metrics);

    const okSpan = tracer.startSpan("worker.dispatch_agent", {
      agentId: "agent_obs"
    });
    okSpan.end({ contentLength: 12 });

    const failingSpan = tracer.startSpan("worker.dispatch_agent", {
      agentId: "agent_failure"
    });
    failingSpan.fail(new Error("boom"));

    const events = stream.entries.map((entry) => JSON.parse(entry));

    expect(events.map((entry) => `${entry.event}:${entry.result ?? ""}`)).toEqual([
      "trace.span.start:",
      "trace.span.end:ok",
      "trace.span.start:",
      "trace.span.end:error"
    ]);
    expect(metrics.snapshot().counters).toEqual([
      expect.objectContaining({
        labels: { result: "ok", span: "worker.dispatch_agent" },
        name: "trace_span_total",
        value: 1
      }),
      expect.objectContaining({
        labels: { result: "error", span: "worker.dispatch_agent" },
        name: "trace_span_total",
        value: 1
      })
    ]);
  });
});
