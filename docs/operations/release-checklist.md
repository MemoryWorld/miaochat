# Release 1 Readiness Checklist

This checklist gates the AgentHub Release 1 cut. Every item must be confirmed
green before the release branch is tagged.

## Production Target

- Concurrent web clients: `3 000`
- Concurrent agent executions: `500`
- Browser stream transport: `HTTP + SSE`
- Provider scope: `Hermes`, `OpenClaw`, `Codex`, `Claude Code`

## Functional Coverage

- [ ] BYOK onboarding completes end-to-end for each of the four providers
      using real credentials (validated through the setup flow).
- [ ] Single-agent conversation persists, streams, and reloads through the
      mock adapter (existing `tests/integration/single-agent-mock.spec.ts`).
- [ ] Group orchestration produces deterministic partial-failure surfaces
      (existing `tests/integration/group-failure.spec.ts`).
- [ ] Pinned-context replay is included in the assembled provider request
      (existing `tests/integration/pinned-context.spec.ts`).
- [ ] Custom-agent registry, tool registry, and the web flows in
      `tests/e2e/custom-agent-ui.spec.tsx` all pass.
- [ ] Artifact preview, attachment, and Diff cards render inside the chat
      timeline (`tests/e2e/artifact-cards.spec.tsx`).

## Real-Provider Acceptance

- [ ] `tests/e2e/hermes-real.spec.ts` passes against the local replay server.
- [ ] `tests/e2e/openclaw-real.spec.ts` passes against the local replay server.
- [ ] `tests/e2e/codex-real.spec.ts` passes against the local replay server.
- [ ] `tests/e2e/claude-code-real.spec.ts` passes against the local replay server.
- [ ] Each of the four real-provider acceptance specs is rerun against the
      production SaaS endpoints with valid BYOK credentials configured via
      `HERMES_BASE_URL`, `OPENCLAW_BASE_URL`, `CODEX_BASE_URL`, and
      `CLAUDE_CODE_BASE_URL`.

## Observability

- [ ] `GET /health/liveness` and `GET /health/readiness` return `200` for the
      API service.
- [ ] `GET /metrics` exposes the Release 1 counter and summary families
      documented in `docs/operations/observability.md`.
- [ ] Worker dispatch activities emit `worker.dispatch_agent.failed` log
      entries on failure with structured context.
- [ ] OpenTelemetry collector and Prometheus configurations under
      `infra/observability/` are wired into the deploy stack.

## Guardrails

- [ ] Rate limit returns a structured `429` with `code`, `message`, and
      `retryAfterMs` (`tests/integration/rate-limit.spec.ts`).
- [ ] Internal errors are translated through `mapToPublicError`
      (`tests/integration/error-mapping.spec.ts`).
- [ ] Worker retry policy emits backoff and exhaustion log lines
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
| `pnpm test:e2e` | All ten e2e tests pass, including the four real-provider acceptance specs. |
| `pnpm test:load` | Placeholder runs cleanly; the four real k6 scenarios are run separately and recorded in `docs/operations/load-test-results.md`. |
| `k6 run tests/load/<scenario>.js` | Each scenario passes its k6 thresholds. |

## Sign-Off

- [ ] Engineering owner: __________________________
- [ ] Operations owner: __________________________
- [ ] QA owner: ___________________________________
- [ ] Date of release cut: ________________________
