# Release Readiness Checklist

This checklist gates the current Miaochat release branch. It reflects the
Phase E product direction: Chinese workspace, AI 同事, DeepSeek model connection,
and plan-first coding collaboration.

## Phase E Snapshot

- [x] Settings exposes `模型连接` as the primary setup path.
- [x] DeepSeek connection validation is implemented through the API.
- [x] AI teammate creation supports templates, custom profiles, memory,
      approvals, model preference, tools, and output style.
- [x] Coding work mode supports a selected recommended teammate set.
- [x] Deleted teammates are excluded from workflow launch.
- [x] Channel detail can recover from failed activity and keeps context across
      tabs.
- [x] Inbox, tasks, calendar, channels, members, billing, and capability
      management expose operational skeletons.
- [ ] Real DeepSeek API Key acceptance must still be run by a human.
- [ ] Human-recorded `3` minute demo video remains outstanding.
- [ ] Staging and formal load-test evidence remain outstanding.

## Production Target

- Concurrent web clients: `3 000`
- Concurrent AI teammate executions: `500`
- Browser stream transport: `HTTP + SSE`
- Current public model connection: `DeepSeek`

## Functional Coverage

- [x] Model connection contract is covered in `packages/contracts`.
- [x] DeepSeek connection validate/create/list flow is covered by
      `tests/integration/deepseek-connection.spec.ts`.
- [x] Coding workflow API is covered by
      `tests/integration/coding-workflow-api.spec.ts`.
- [x] Coding workflow execution is covered by
      `tests/integration/coding-workflow-execution.spec.ts`.
- [x] Workspace shell projections are covered by
      `tests/integration/workspace-shell-api.spec.ts`.
- [x] Core web surfaces have component coverage under `apps/web/src/**`.

## Real-Key Acceptance

Run this before claiming customer-ready collaborative coding:

1. Start local infra and run migrations.
2. Start API, worker, and web.
3. Log in through the browser.
4. Open `设置 > 模型连接`.
5. Add a real DeepSeek API Key.
6. Validate and save the connection.
7. Open `工作台 > 编码`.
8. Keep at least two AI 同事 selected.
9. Start the workflow.
10. Approve the plan.
11. Confirm implementation, review, and test updates appear in the channel
    timeline.
12. Refresh the page and confirm the timeline persists.

## Observability

- [x] `GET /health/liveness` and `GET /health/readiness` return `200` for the
      API service.
- [x] `GET /metrics` exposes release counters and summaries.
- [x] Worker failures emit structured log entries.
- [x] OpenTelemetry collector and Prometheus configurations under
      `infra/observability/` are wired into the deploy stack.

## Guardrails

- [x] Rate limit returns a structured `429` with `code`, `message`, and
      `retryAfterMs`.
- [x] Internal errors are translated through public-safe error mapping.
- [x] Worker retry policy emits backoff and exhaustion log lines.
- [x] Model connection lists never return raw or encrypted secrets.

## Load Tests

- [ ] `tests/load/session-list.js` passes its k6 thresholds with the release
      target.
- [ ] `tests/load/send-message.js` passes its k6 thresholds.
- [ ] `tests/load/group-orchestration.js` passes its k6 thresholds.
- [ ] `tests/load/stream-stability.js` passes its k6 thresholds.
- [ ] Results are recorded in `docs/operations/load-test-results.md`.

## Verification Command Matrix

| Command | Expected Outcome |
| --- | --- |
| `pnpm install` | Clean install with no lockfile drift. |
| `pnpm db:migrate` | All migrations apply. |
| `pnpm --filter @agenthub/contracts build` | Contracts build. |
| `pnpm --filter api build` | API builds. |
| `pnpm --filter worker build` | Worker builds. |
| `pnpm --filter web build` | Web builds. |
| `pnpm --filter web test` | Web component tests pass or report known open-handle issues. |
| `pnpm test:integration` | Integration suite passes against local test infra. |
| `pnpm exec vitest run tests/integration/deepseek-connection.spec.ts` | DeepSeek connection flow passes. |
| `pnpm exec vitest run tests/integration/coding-workflow-execution.spec.ts` | Coding workflow execution path passes. |
| `pnpm test:load` | Placeholder runs cleanly until k6 scenarios are restored. |
