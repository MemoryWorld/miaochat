# 2026-05-21 Guardrails Slice

## Scope

- Completed `Task 29`

## Changes

- Added `packages/domain/src/errors/public-error-mapper.ts` with a
  `PublicErrorCode` catalog (rate_limited, validation, credential_invalid,
  provider_failed, provider_timeout, not_found, workspace_unauthorized,
  internal). `mapToPublicError` translates known error shapes (including
  ZodError, credential validation failures, timeouts, and rate-limit
  signals) into stable user-safe `{ code, message, status }` records, and
  `buildPublicError` adds an optional `retryAfterMs` hint. The new module is
  re-exported from `@agenthub/domain`.
- Added `apps/api/src/modules/limits/rate-limit.service.ts` and
  `limits.module.ts` (Global). The service keeps in-process token buckets
  keyed by an arbitrary string and exposes a `configure({ limit, windowMs })`
  hook so tests can override the production defaults.
- Wired the rate limiter into `MessageDispatchService.send`. The first thing
  the handler does is consume a per-conversation bucket. When the limit is
  exceeded the handler emits a `messages.send.rate_limited` warn log,
  increments `messages_send_rate_limited_total`, and throws a `429`
  HttpException with `{ code, message, retryAfterMs }`.
- Added `apps/worker/src/activities/retry-policy.ts`. It exposes the Temporal
  retry policy constants (`dispatchRetryPolicy`), classifies transient errors
  through `isTransientError`, and provides `runWithRetry` for activities that
  opt into the in-process backoff helper. Retry attempts increment
  `worker_retry_total`/`worker_retry_exhausted_total` counters and emit
  structured `worker.retry` log entries.
- Added `tests/integration/rate-limit.spec.ts` (creates a conversation,
  configures the rate limit to 1, verifies that the second `messages/send`
  call returns the structured `429`) and `tests/integration/error-mapping.spec.ts`
  (covers each public error category, including validation, timeouts,
  credential errors, and the internal fallback).
- Added `apps/worker/test/retry-policy.spec.ts` covering the transient
  classifier, the exponential backoff math, the success-after-retry path, the
  immediate-fail path for non-transient errors, and the policy constants.

## Verification

- `pnpm --filter api test` passed (15 tests).
- `pnpm --filter worker test` passed (14 tests including retry-policy).
- `pnpm test:integration tests/integration/error-mapping.spec.ts tests/integration/rate-limit.spec.ts`
  passed (7 tests).

## Notes

- The rate-limit state is held in-process. For a multi-instance API
  deployment it can be moved behind Redis using the same `RateLimitService`
  surface. The release-readiness log records this as an open risk.
- `tests/integration/error-mapping.spec.ts` imports the mapper through a
  relative path because the workspace has no top-level `@agenthub/domain`
  symlink; the integration suites that import API/worker source still resolve
  the dependency through the application packages.
