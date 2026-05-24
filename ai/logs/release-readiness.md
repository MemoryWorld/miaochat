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
| `pnpm test:e2e` | Pass (20 Playwright browser tests). |
| `pnpm exec vitest run tests/real-provider-test-support.spec.ts` | Pass (2 tests covering staging env contract). |
| `pnpm exec vitest run tests/staging-support.spec.ts tests/seed-load-test-data.spec.ts` | Pass (4 tests covering staging preflight and load-data seeding helpers). |
| `pnpm test:e2e:smoke` | Pass (24 Vitest smoke files / 26 tests, including the four replay-backed real-provider specs). |
| `pnpm test:load` | Placeholder runs cleanly; real k6 scenarios are run separately. |
| `pnpm staging:preflight` | Blocked as expected: GitHub `staging` environment now exists, but the workflow is not yet on the default branch and 25 staging secrets are still missing. |
| `AGENTHUB_API_BASE_URL=http://localhost:3001 pnpm staging:seed-load` | Pass; prints export-ready direct/group/stream conversation ids after creating mock load-test agents and conversations. |

## Release Acceptance Evidence

- Real-provider acceptance: `docs/operations/provider-acceptance.md` plus the
  `tests/e2e/{hermes,openclaw,codex,claude-code}-real.spec.ts` specs.
- Browser e2e harness: `playwright.config.ts`,
  `tests/e2e-playwright/`, `docs/operations/e2e-playwright.md`.
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
2. `Hermes` and `OpenClaw` now have reported local Xiaomi MiMo shim evidence,
   but `Codex` and `Claude Code` still need a committed real-upstream staging
   pass to satisfy the formal delivery gate.
3. The staging-only runner and browser BYOK suite now have local preflight and
   load-data helper scripts, but formal execution is still blocked until the
   workflow is merged to the default branch and the GitHub `staging`
   environment is populated with the 25 required secrets for URLs, provider
   credentials, and load-test conversation ids.

## Sign-Off Record

- Engineering owner: __________________________
- Operations owner: __________________________
- QA owner: ___________________________________
- Release tag: ________________________________
- Cut date: ___________________________________
- Notes:
