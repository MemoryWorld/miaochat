import { Controller, Get, Header, Inject } from "@nestjs/common";

import { MetricsRegistry } from "./metrics-registry.service.js";

@Controller()
export class ObservabilityController {
  constructor(
    @Inject(MetricsRegistry) private readonly metricsRegistry: MetricsRegistry
  ) {}

  @Get("metrics")
  @Header("Content-Type", "text/plain; version=0.0.4")
  metrics(): string {
    return this.metricsRegistry.exportPrometheus();
  }

  @Get("health/readiness")
  readiness() {
    return {
      service: "api",
      status: "ready"
    };
  }

  @Get("health/liveness")
  liveness() {
    return {
      service: "api",
      status: "alive"
    };
  }
}
