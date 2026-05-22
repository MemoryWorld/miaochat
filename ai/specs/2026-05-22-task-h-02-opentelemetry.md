# Spec: Task H-02 OpenTelemetry Tracing

## Objective
Replace the current trace-only log shim with a real OpenTelemetry tracing runtime for API and worker while preserving the existing `trace.span.start` and `trace.span.end` log lines as a fallback contract. Success means spans are created through the OpenTelemetry SDK, can be exported through OTLP when configured, and API/worker trace wrappers keep their current public interface.

## Commands
- Install deps after package scaffolding: `pnpm install`
- API tests: `DATABASE_URL=postgres://agenthub:agenthub@localhost:5432/agenthub_h02_test pnpm --filter api test`
- Worker tests: `pnpm --filter worker test`
- Build: `pnpm --filter api build && pnpm --filter worker build`

## Project Structure
- `packages/observability-otel/src/index.ts`: shared OpenTelemetry runtime
- `apps/api/src/observability/observability.module.ts`: API runtime wiring
- `apps/api/src/observability/trace-recorder.service.ts`: API trace wrapper
- `apps/worker/src/observability/observability.ts`: worker trace wrapper + singleton wiring
- `apps/api/test/observability.e2e-spec.ts`: API trace/log contract tests
- `apps/worker/test/observability.spec.ts`: worker trace/log contract tests

## Code Style
Keep the existing `TraceRecorder` and `WorkerTraceRecorder` entry points. Add a small shared runtime layer instead of pushing OpenTelemetry details into every call site.

## Testing Strategy
- Extend API and worker observability tests to assert:
  - `trace.span.start` / `trace.span.end` logs still emit
  - finished OpenTelemetry spans are exported with span names and attributes
  - failure paths mark spans as errors and record exception data
- Use an in-memory exporter in tests; only runtime wiring should look at OTLP env vars.

## Boundaries
- Always: keep existing log fallback, keep metrics behavior, coerce non-OTel-safe attributes safely
- Ask first: adding auto-instrumentation, HTTP middleware tracing, baggage propagation, or new external collector config files
- Never: silently drop existing trace logs before real spans are proven in tests

## Success Criteria
- `packages/observability-otel` exists and provides a reusable tracing runtime
- API and worker trace recorders create OpenTelemetry spans and still emit fallback logs
- OTLP exporter wiring is present for runtime environments
- `pnpm --filter api test`, `pnpm --filter worker test`, `pnpm --filter api build`, and `pnpm --filter worker build` pass
