import { Global, Module } from "@nestjs/common";

import { OpenTelemetryRuntime } from "@agenthub/observability-otel";

import { ErrorReporterService } from "./error-reporter.service.js";
import { MetricsRegistry } from "./metrics-registry.service.js";
import { ObservabilityController } from "./observability.controller.js";
import { StructuredLogger } from "./structured-logger.service.js";
import { TraceRecorder } from "./trace-recorder.service.js";

@Global()
@Module({
  controllers: [ObservabilityController],
  exports: [
    ErrorReporterService,
    MetricsRegistry,
    StructuredLogger,
    TraceRecorder,
    OpenTelemetryRuntime
  ],
  providers: [
    {
      provide: StructuredLogger,
      useFactory: () =>
        new StructuredLogger({
          serviceName: process.env.SERVICE_NAME ?? "api"
        })
    },
    {
      provide: OpenTelemetryRuntime,
      useFactory: () =>
        new OpenTelemetryRuntime({
          serviceName: process.env.SERVICE_NAME ?? "api"
        })
    },
    ErrorReporterService,
    MetricsRegistry,
    TraceRecorder
  ]
})
export class ObservabilityModule {}

export { ErrorReporterService } from "./error-reporter.service.js";
export { MetricsRegistry } from "./metrics-registry.service.js";
export { StructuredLogger } from "./structured-logger.service.js";
export { TraceRecorder } from "./trace-recorder.service.js";
export { OpenTelemetryRuntime } from "@agenthub/observability-otel";
export type { LogFields, LogLevel } from "./structured-logger.service.js";
export type { MetricLabels } from "./metrics-registry.service.js";
export type { TraceSpan, TraceSpanFields } from "./trace-recorder.service.js";
