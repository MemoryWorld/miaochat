# Spec: Task H-01 Pino Logging

## Objective
Replace the in-house JSON logger in `apps/api` and `apps/worker` with `pino` while preserving the current log contract used by tests and downstream observability. Success means callers keep using the existing logger wrappers, emitted records still expose `event`, `level`, `service`, and `ts`, child loggers keep inheriting context, and sensitive fields are redacted instead of being written verbatim.

## Commands
- Install deps: `pnpm --filter api add pino && pnpm --filter worker add pino`
- API tests: `pnpm --filter api test`
- Worker tests: `pnpm --filter worker test`
- Build: `pnpm --filter api build && pnpm --filter worker build`

## Project Structure
- `apps/api/src/observability/structured-logger.service.ts`: API logger wrapper
- `apps/worker/src/observability/observability.ts`: worker logger + metrics/tracing
- `apps/api/test/observability.e2e-spec.ts`: API logger contract tests
- `apps/worker/test/observability.spec.ts`: worker logger contract tests

## Code Style
Keep the current wrapper classes and public method names. Prefer additive configuration around `pino` over broad refactors so existing call sites remain unchanged.

## Testing Strategy
- Extend API and worker observability tests first to prove:
  - existing log fields remain present
  - child logger fields are merged into emitted records
  - sensitive fields such as `rawSecret` are redacted
  - `Error` objects are serialized structurally
- Then swap the implementations to Pino and run package tests/builds.

## Boundaries
- Always: preserve `event`, `level`, `service`, and `ts`; keep wrappers injectable and call-site compatible
- Ask first: changing log field names, moving observability code into a shared package, adding pretty-print/dev-only transports
- Never: log raw credentials, auth cookies, or passwords in clear text

## Success Criteria
- API and worker logger wrappers are backed by `pino`
- Existing log contract remains compatible with current tests and call sites
- Child logger semantics are preserved
- Sensitive fields are redacted and `Error` objects are serialized
- `pnpm --filter api test`, `pnpm --filter worker test`, `pnpm --filter api build`, and `pnpm --filter worker build` pass
