# Observability

This document describes the structured logging, tracing, metrics, and health
signals available in AgentHub Release 1.

## Structured Logging

The API and worker both emit JSON log lines with the following baseline fields:

| Field   | Description                                                    |
| ------- | -------------------------------------------------------------- |
| `level` | `debug`, `info`, `warn`, or `error`                            |
| `event` | A short event name such as `provider.dispatch.failed`          |
| `service` | `api` or `worker`                                            |
| `ts`    | ISO-8601 timestamp                                             |

Trace spans add `span`, `spanId`, `traceId`, `result`, and `durationMs` fields
on completion so a downstream collector can correlate per-request behavior.

The minimum level is controlled by the `LOG_LEVEL` environment variable; the
default is `info`.

## Health Signals

| Path                | Purpose                                                   |
| ------------------- | --------------------------------------------------------- |
| `GET /health`       | Existing liveness check used by the smoke test suite.     |
| `GET /health/liveness` | Indicates the API process is up.                       |
| `GET /health/readiness` | Indicates the API process is ready to accept traffic. |

The worker exposes its readiness through the worker process bootstrap: a
worker that fails to register its Temporal task queue exits with a non-zero
code, which is the operational readiness signal.

## Metrics

The API exposes Prometheus metrics on `GET /metrics`. The worker emits the
same metric families through its in-process `WorkerMetricsRegistry`, which is
exported to OTLP when `OTEL_EXPORTER_OTLP_ENDPOINT` is set.

Core counters:

- `provider_dispatch_total{mode,provider}`
- `provider_dispatch_success_total{mode,provider}`
- `provider_dispatch_error_total{mode,provider}`
- `orchestrator_state_total{label,state}`
- `worker_dispatch_total{provider}`
- `worker_dispatch_success_total{provider}`
- `worker_dispatch_error_total{provider}`
- `trace_span_total{span,result}`

Core summaries:

- `trace_span_duration_ms{span,result}`

## Tracing

Traces are emitted as paired `trace.span.start` and `trace.span.end` log
events. Each span carries a `spanId`, `traceId`, `durationMs`, and a
free-form set of `fields` describing the operation (for example
`agentId`, `conversationId`, and `provider`).

Release 1 keeps the tracing path lightweight on purpose so that no extra
OpenTelemetry SDK dependency is mandatory at install time. The bundled
`infra/observability/otel-config.yaml` accepts OTLP traffic when a real
OpenTelemetry SDK is layered on top of the structured logger in a later
release.

## Local Stack

`infra/observability/otel-config.yaml` and `infra/observability/prometheus.yml`
describe the local observability target topology. They are referenced by the
operations runbook and are intended to be wired into the Docker Compose stack
when the production cut is performed.
