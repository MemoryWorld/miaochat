import { Global, Module } from "@nestjs/common";

import { MetricsRegistry } from "./metrics-registry.service.js";
import { ObservabilityController } from "./observability.controller.js";
import { StructuredLogger } from "./structured-logger.service.js";
import { TraceRecorder } from "./trace-recorder.service.js";

@Global()
@Module({
  controllers: [ObservabilityController],
  exports: [MetricsRegistry, StructuredLogger, TraceRecorder],
  providers: [
    {
      provide: StructuredLogger,
      useFactory: () =>
        new StructuredLogger({
          serviceName: process.env.SERVICE_NAME ?? "api"
        })
    },
    MetricsRegistry,
    TraceRecorder
  ]
})
export class ObservabilityModule {}

export { MetricsRegistry } from "./metrics-registry.service.js";
export { StructuredLogger } from "./structured-logger.service.js";
export { TraceRecorder } from "./trace-recorder.service.js";
export type { LogFields, LogLevel } from "./structured-logger.service.js";
export type { MetricLabels } from "./metrics-registry.service.js";
export type { TraceSpan, TraceSpanFields } from "./trace-recorder.service.js";
