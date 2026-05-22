# Release Readiness Log

## Scope

- Captures the readiness state of AgentHub Release 1 against the fixed
  production target of `3 000` concurrent web clients and `500` concurrent
  agent executions.
- Anchors the release-checklist evidence trail.

## Verification Snapshot

| Command | Outcome |
| --- | --- |
| `pnpm --filter @agenthub/contracts test` | Pass (7 tests). |
| `pnpm --filter @agenthub/agent-adapters test` | Pass (15 tests across mock, hermes, openclaw, codex, claude-code). |
| `pnpm --filter api test` | Pass (15 tests including observability + health). |
| `pnpm --filter worker test` | Pass (14 tests including retry-policy + observability). |
| `pnpm --filter web test` | Pass (6 tests across chat, agents, setup). |
| `pnpm test:e2e` | Pass (10 tests, including the four real-provider acceptance specs). |
| `pnpm test:load` | Placeholder runs cleanly; real k6 scenarios are run separately. |

## Release Acceptance Evidence

- Real-provider acceptance: `docs/operations/provider-acceptance.md` plus the
  `tests/e2e/{hermes,openclaw,codex,claude-code}-real.spec.ts` specs.
- Observability readiness: `docs/operations/observability.md`,
  `infra/observability/otel-config.yaml`, `infra/observability/prometheus.yml`.
- Guardrails: `apps/api/src/modules/limits/rate-limit.service.ts`,
  `packages/domain/src/errors/public-error-mapper.ts`,
  `apps/worker/src/activities/retry-policy.ts`.
- Load tests: `tests/load/{session-list,send-message,group-orchestration,stream-stability}.js`.
- Runtime readiness: `docs/architecture/runtime-readiness.md`.
- Release checklist: `docs/operations/release-checklist.md`.
- Load-test results template: `docs/operations/load-test-results.md`.

## Open Risks

1. The integration tests under `tests/integration/{group-orchestrator,group-failure,
   pinned-context,single-agent-mock}.spec.ts` boot a Temporal worker. They
   require Temporal, Postgres, and S3-compatible storage to be reachable in
   CI. The release pipeline must provision these dependencies before running
   `pnpm test:integration`.
2. The four real-provider acceptance specs run against an in-process HTTP
   server by default. Operational validation against the real SaaS endpoints
   is gated behind the environment variables enumerated in
   `docs/operations/provider-acceptance.md`.
3. Rate-limit state is currently held in-process. For a multi-instance API
   deployment the implementation should be moved behind Redis using the same
   `RateLimitService` interface.

## Sign-Off Record

- Engineering owner: __________________________
- Operations owner: __________________________
- QA owner: ___________________________________
- Release tag: ________________________________
- Cut date: ___________________________________
- Notes:
