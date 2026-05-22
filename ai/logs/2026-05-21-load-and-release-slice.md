# 2026-05-21 Load And Release-Readiness Slice

## Scope

- Completed `Task 35` and `Task 36`.

## Changes

- Added four `k6` scenarios under `tests/load/`:
  - `session-list.js` ramps to `3 000` virtual users hitting `GET /conversations`
    with `p95 < 400ms` and `< 1%` error thresholds.
  - `send-message.js` runs a `750 / s` arrival rate against `POST /messages/send`,
    asserting the response is either `202` or `429` with a `retryAfterMs` hint.
  - `group-orchestration.js` ramps to `500` concurrent VUs hitting the same
    endpoint with group conversation IDs, tagging partial failures and
    enforcing `p95 < 1 500 ms`.
  - `stream-stability.js` keeps `3 000` long-lived SSE subscribers connected to
    `GET /streams/:conversationId` and tracks connect latency plus
    disconnect counts.
- Added `tests/load/README.md` describing each scenario, the Release 1
  capacity targets, the threshold matrix, and the environment variables
  (`AGENTHUB_API_BASE_URL`, `AGENTHUB_LOAD_CONVERSATION_IDS`, etc.) operators
  use to point the scripts at the real deployment.
- Updated `tests/load/placeholder.js` so `pnpm test:load` continues to run
  cleanly and reminds operators where the real `k6` entrypoints live.
- Added `docs/operations/release-checklist.md` covering the production
  target, functional coverage, real-provider acceptance, observability,
  guardrails, load-test outcomes, and the verification command matrix.
- Added `docs/operations/load-test-results.md` as the per-cut report
  template covering scenario thresholds, observed values, bottleneck notes,
  and the release decision table.
- Added `docs/architecture/runtime-readiness.md` with the runtime topology
  diagram, service roles, state stores, observability hooks, failure
  surfaces, capacity validation, and future expansion hooks.
- Added `ai/logs/release-readiness.md` capturing the verification snapshot,
  evidence trail, open risks, and sign-off record.

## Verification

- `pnpm test:load` runs the placeholder cleanly (the real scenarios run via
  the operational `k6` runner per `tests/load/README.md`).
- `pnpm test:e2e` passed (10 tests).
- Per-package suites (contracts, agent-adapters, api, worker, web) pass per
  the snapshot recorded in `ai/logs/release-readiness.md`.

## Notes

- The `pnpm test` aggregator depends on `^build` so a fresh CI run should
  invoke `pnpm build` (or rely on the turbo cache) before `pnpm test`. Each
  package's `pnpm --filter <pkg> test` script runs cleanly without that
  prerequisite.
- The release-readiness log explicitly lists the integration tests that need
  Temporal, Postgres, and S3 to be reachable in CI; these are infra-bound
  and not runnable in this slice's environment.
