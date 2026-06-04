import { describe, expect, it } from "vitest";

import { OpenTelemetryRuntime } from "../src/index";
import type { OpenTelemetrySpan } from "../src/index";

describe("OpenTelemetryRuntime", () => {
  it("exports types and class", () => {
    expect(OpenTelemetryRuntime).toBeDefined();
    expect(typeof OpenTelemetryRuntime).toBe("function");
  });

  it("creates runtime with no exporter", () => {
    const runtime = new OpenTelemetryRuntime({ serviceName: "test" });
    expect(runtime.serviceName).toBe("test");
  });

  it("startSpan returns span with spanId, traceId, lifecycle helpers, and events", () => {
    const runtime = new OpenTelemetryRuntime({ serviceName: "test" });
    const span: OpenTelemetrySpan = runtime.startSpan("test-span");

    expect(span.spanId).toBeDefined();
    expect(span.spanId).toMatch(/^[a-f0-9]{16}$/);
    expect(span.traceId).toBeDefined();
    expect(span.traceId).toMatch(/^[a-f0-9]{32}$/);
    expect(typeof span.end).toBe("function");
    expect(typeof span.fail).toBe("function");
    expect(typeof span.recordEvent).toBe("function");
  });

  it("end() and fail() complete without error", () => {
    const runtime = new OpenTelemetryRuntime({ serviceName: "test" });

    const span1 = runtime.startSpan("end-span");
    span1.end();
    expect(span1.spanId).toBeDefined();

    const span2 = runtime.startSpan("fail-span");
    span2.fail(new Error("boom"));
    expect(span2.spanId).toBeDefined();
  });

  it("shutdown completes without error", async () => {
    const runtime = new OpenTelemetryRuntime({ serviceName: "test" });
    runtime.startSpan("span").end();
    await runtime.shutdown();
  });
});
