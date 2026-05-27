# Release 1 Readiness Checklist

This checklist gates the AgentHub Release 1 cut. Every item must be confirmed
green before the release branch is tagged.

## Phase A Snapshot

This repository also tracks a narrower implementation milestone:
`Phase A: Hermes + OpenClaw Baseline`.

Phase A is **not** the Release 1 cut. It proves the current runtime baseline
while explicitly leaving the full four-provider release gate open.

- [x] `tests/integration/phase-a-runtime-baseline.spec.ts` proves direct chat,
      group orchestration, pinned-context replay, and normalized streaming
      events through the real `Hermes` + `OpenClaw` runtime path.
- [x] `tests/e2e/hermes-real.spec.ts` and `tests/e2e/openclaw-real.spec.ts`
      still pass at the adapter acceptance layer.
- [x] `tests/e2e/byok-onboarding.spec.tsx` covers the guided BYOK flow for
      both in-scope Phase A providers.
- [ ] Demo video remains outstanding.
- [ ] Full Release 1 still requires `Codex`, `Claude Code`, staging acceptance,
      load-test evidence, and final sign-off.

## Production Target

- Concurrent web clients: `3 000`
- Concurrent agent executions: `500`
- Browser stream transport: `HTTP + SSE`
- Provider scope: `Hermes`, `OpenClaw`, `Codex`, `Claude Code`

## Functional Coverage

- [ ] BYOK onboarding completes end-to-end for each of the four providers
      using real credentials (validated through `pnpm test:e2e:byok:staging`).
- [x] Single-agent conversation persists, streams, and reloads through the
      mock adapter (existing `tests/integration/single-agent-mock.spec.ts`).
- [x] Group orchestration produces deterministic partial-failure surfaces
      (existing `tests/integration/group-failure.spec.ts`).
- [x] Pinned-context replay is included in the assembled provider request
      (existing `tests/integration/pinned-context.spec.ts`).
- [x] Custom-agent registry, tool registry, and the web flows in
      `tests/e2e/custom-agent-ui.spec.tsx` all pass.
- [x] Artifact preview, attachment, and Diff cards render inside the chat
      timeline (`tests/e2e/artifact-cards.spec.tsx`).

## Real-Provider Acceptance

- [x] `tests/e2e/hermes-real.spec.ts` passes against the reported
      `2026-05-24` Xiaomi MiMo local shim path documented in
      `docs/operations/provider-acceptance.md`.
- [x] `tests/e2e/openclaw-real.spec.ts` passes against the reported
      `2026-05-24` Xiaomi MiMo local shim path documented in
      `docs/operations/provider-acceptance.md`.
- [ ] `tests/e2e/codex-real.spec.ts` passes against the staging SaaS endpoint.
- [ ] `tests/e2e/claude-code-real.spec.ts` passes against the staging SaaS endpoint.
- [ ] `pnpm test:e2e:byok:staging` completes the browser-driven `/setup`
      flow for all four providers using real credentials.
- [ ] `pnpm test:e2e:staging` reruns the four real-provider acceptance specs
      against the staging SaaS endpoints with rotated BYOK credentials
      configured via `HERMES_*`, `OPENCLAW_*`, `CODEX_*`, `CLAUDE_CODE_*`,
      `AGENTHUB_WEB_BASE_URL`, and the `*_E2E_*` browser BYOK environment
      variables.

## Observability

- [x] `GET /health/liveness` and `GET /health/readiness` return `200` for the
      API service.
- [x] `GET /metrics` exposes the Release 1 counter and summary families
      documented in `docs/operations/observability.md`.
- [x] Worker dispatch activities emit `worker.dispatch_agent.failed` log
      entries on failure with structured context.
- [x] OpenTelemetry collector and Prometheus configurations under
      `infra/observability/` are wired into the deploy stack.

## Guardrails

- [x] Rate limit returns a structured `429` with `code`, `message`, and
      `retryAfterMs` (`tests/integration/rate-limit.spec.ts`).
- [x] Internal errors are translated through `mapToPublicError`
      (`tests/integration/error-mapping.spec.ts`).
- [x] Worker retry policy emits backoff and exhaustion log lines
      (`apps/worker/test/retry-policy.spec.ts`).

## Load Tests

- [ ] `tests/load/session-list.js` passes its k6 thresholds with the release
      target (3 000 VUs).
- [ ] `tests/load/send-message.js` passes its k6 thresholds at 750 RPS
      sustained.
- [ ] `tests/load/group-orchestration.js` passes its k6 thresholds at 500
      concurrent orchestrations.
- [ ] `tests/load/stream-stability.js` passes its k6 thresholds with 3 000
      long-lived SSE clients.
- [ ] Results are recorded in `docs/operations/load-test-results.md`.

## Verification Command Matrix

| Command | Expected Outcome |
| --- | --- |
| `pnpm install` | Clean install with no lockfile drift. |
| `pnpm lint` | Lint passes for every workspace. |
| `pnpm test` | All package-level test suites pass. |
| `pnpm test:integration` | Integration suite passes against the deployed test infra. |
| `pnpm test:e2e` | Playwright browser e2e suite passes against the Next.js app. |
| `pnpm staging:preflight` | Reports the GitHub `staging` environment state, default-branch workflow availability, and any missing staging secrets. |
| `pnpm test:e2e:byok:staging` | Browser-driven staging `/setup` flow passes for all four providers using real credentials. |
| `pnpm test:e2e:smoke` | Existing vitest+jsdom smoke suite passes, including the four local replay real-provider specs. |
| `pnpm test:e2e:providers` | Real-provider specs pass in the current mode (`local` protocol server by default, `staging` when enabled). |
| `pnpm test:e2e:staging` | Secrets-backed staging runner completes provider acceptance plus the four k6 scenarios. |
| `pnpm test:load` | Placeholder runs cleanly; the four real k6 scenarios are run separately and recorded in `docs/operations/load-test-results.md`. |
| `pnpm staging:seed-load` | Creates mock staging load-test conversations and prints export-ready `AGENTHUB_LOAD_*` values. |
| `k6 run tests/load/<scenario>.js` | Each scenario passes its k6 thresholds. |

## Hardening Track

- [x] `H-05` Drizzle migration is in place for conversations, messages, custom
      agents, credentials, and artifacts.
- [x] `H-06` `pgBouncer` fronts the compose and Kubernetes Postgres targets.
- [x] `H-07` Tailwind CSS and the web token baseline are wired into `apps/web`.
- [x] `H-08` `pnpm test:e2e` now runs Playwright; `pnpm test:e2e:smoke`
      retains the jsdom suite.
- [x] `H-09` Supertest contract tests cover auth, workspaces, messages,
      artifacts, and credentials.
- [x] `H-10` staging provider acceptance and k6 runner entrypoints are wired;
      the latest committed state is documented in
      `docs/operations/load-test-results.md`.

## Sign-Off

- [ ] Engineering owner: __________________________
- [ ] Operations owner: __________________________
- [ ] QA owner: ___________________________________
- [ ] Date of release cut: ________________________
