# 2026-05-21 Observability Slice

## Scope

- Completed `Task 28`

## Changes

- Added a structured observability stack to the API service under
  `apps/api/src/observability/`. The `StructuredLogger` writes JSON lines with
  a configurable minimum level and a fixed service tag. The `MetricsRegistry`
  tracks counters and histograms with Prometheus-compatible exposition. The
  `TraceRecorder` emits start/end log lines, increments span counters, and
  observes a duration summary.
- Wired `ObservabilityModule` as a Global module so any feature module can
  inject the logger, metrics, and tracer without explicit re-imports.
- Added an `ObservabilityController` exposing `GET /metrics`, `GET /health/liveness`,
  and `GET /health/readiness`. The existing `GET /health` route stays as the
  baseline liveness signal.
- Instrumented `MessageDispatchService` to emit traces and counters around
  direct and group dispatch, including orchestrator state transitions, with
  structured failure logs that capture the exception message and the
  conversation context.
- Added a parallel observability surface to the worker under
  `apps/worker/src/observability/observability.ts` that mirrors the API
  contract through standalone classes with shared module-level singletons.
  `dispatch-agent.activity.ts` now opens a span around each adapter
  invocation, increments the worker dispatch counters, and emits structured
  failure logs.
- Added `infra/observability/otel-config.yaml` and `infra/observability/prometheus.yml`
  to describe the operational scrape and OTLP fan-out targets.
- Documented the surfaces, log fields, metrics, and configuration knobs in
  `docs/operations/observability.md`.
- Added `apps/api/test/observability.e2e-spec.ts` (logger, metrics registry,
  trace recorder, and the `/metrics`, `/health/liveness`, `/health/readiness`
  endpoints) and `apps/worker/test/observability.spec.ts` (worker logger,
  metrics registry, and trace recorder).

## Verification

- `pnpm --filter api test` passed (15 tests across health, conversations,
  credentials, custom-agents, streams, and observability).
- `pnpm --filter worker test` passed (8 tests across worker bootstrap, group
  orchestrator, and observability).

## Notes

- The Release 1 build keeps tracing intentionally lightweight so no extra
  OpenTelemetry SDK dependency is mandatory at install time. The collector
  config under `infra/observability/` accepts OTLP traffic when a real SDK is
  layered on top of the structured logger in a later release.
- Worker observability uses module-level singletons for parity with how
  Temporal activities consume non-injected services. `resetWorkerObservability`
  is exposed for tests.
