import { Writable } from "node:stream";

import { afterEach, describe, expect, it } from "vitest";

import type { NestFastifyApplication } from "@nestjs/platform-fastify";

import { createApp } from "../src/main.js";
import { MetricsRegistry } from "../src/observability/metrics-registry.service.js";
import { StructuredLogger } from "../src/observability/structured-logger.service.js";
import { TraceRecorder } from "../src/observability/trace-recorder.service.js";

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

describe("api observability", () => {
  let app: NestFastifyApplication | undefined;

  afterEach(async () => {
    await app?.close();
  });

  it("emits structured JSON log lines from the StructuredLogger", () => {
    const stream = new CapturingStream();
    const logger = new StructuredLogger({
      minLevel: "info",
      serviceName: "api-test",
      stream
    });

    logger.info("provider.dispatch.started", {
      conversationId: "conv_obs_1",
      provider: "mock"
    });
    logger.error("provider.dispatch.failed", {
      conversationId: "conv_obs_1",
      provider: "mock"
    });

    expect(stream.entries).toHaveLength(2);
    expect(JSON.parse(stream.entries[0]!)).toEqual(
      expect.objectContaining({
        conversationId: "conv_obs_1",
        event: "provider.dispatch.started",
        level: "info",
        provider: "mock",
        service: "api-test"
      })
    );
    expect(JSON.parse(stream.entries[1]!).level).toBe("error");
  });

  it("records counters, histograms, and Prometheus exposition", () => {
    const registry = new MetricsRegistry();

    registry.incrementCounter("provider_dispatch_total", { provider: "mock" });
    registry.incrementCounter("provider_dispatch_total", { provider: "mock" });
    registry.observeHistogram("trace_span_duration_ms", 12, { span: "dispatch" });
    registry.observeHistogram("trace_span_duration_ms", 24, { span: "dispatch" });

    expect(registry.snapshot().counters).toEqual([
      {
        labels: { provider: "mock" },
        name: "provider_dispatch_total",
        value: 2
      }
    ]);
    expect(registry.snapshot().histograms).toEqual([
      {
        count: 2,
        labels: { span: "dispatch" },
        name: "trace_span_duration_ms",
        sum: 36
      }
    ]);

    const exposition = registry.exportPrometheus();

    expect(exposition).toContain("# TYPE provider_dispatch_total counter");
    expect(exposition).toContain('provider_dispatch_total{provider="mock"} 2');
    expect(exposition).toContain("trace_span_duration_ms_count");
    expect(exposition).toContain("trace_span_duration_ms_sum");
  });

  it("emits trace span lifecycle events and increments span metrics", () => {
    const stream = new CapturingStream();
    const logger = new StructuredLogger({
      minLevel: "info",
      serviceName: "api-test",
      stream
    });
    const metrics = new MetricsRegistry();
    const tracer = new TraceRecorder(logger, metrics);

    const span = tracer.startSpan("provider.dispatch.direct", {
      conversationId: "conv_obs_2"
    });
    span.end({ assistantMessageId: "msg_obs_1" });

    const events = stream.entries.map((entry) => JSON.parse(entry));

    expect(events.map((entry) => entry.event)).toEqual([
      "trace.span.start",
      "trace.span.end"
    ]);
    expect(events[1]).toEqual(
      expect.objectContaining({
        assistantMessageId: "msg_obs_1",
        conversationId: "conv_obs_2",
        result: "ok",
        span: "provider.dispatch.direct"
      })
    );
    expect(metrics.snapshot().counters).toEqual([
      expect.objectContaining({
        labels: { result: "ok", span: "provider.dispatch.direct" },
        name: "trace_span_total",
        value: 1
      })
    ]);
  });

  it("exposes /health/readiness, /health/liveness, and /metrics", async () => {
    app = await createApp();
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    const readiness = await app.inject({
      method: "GET",
      url: "/health/readiness"
    });
    const liveness = await app.inject({
      method: "GET",
      url: "/health/liveness"
    });
    const metrics = await app.inject({
      method: "GET",
      url: "/metrics"
    });

    expect(readiness.statusCode).toBe(200);
    expect(readiness.json()).toEqual({ service: "api", status: "ready" });
    expect(liveness.statusCode).toBe(200);
    expect(liveness.json()).toEqual({ service: "api", status: "alive" });
    expect(metrics.statusCode).toBe(200);
    expect(metrics.headers["content-type"]).toContain("text/plain");
  });
});
