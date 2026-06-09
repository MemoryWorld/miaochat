# Release Readiness Checklist

This checklist gates the current Miaochat release branch. It reflects the
Phase E product direction: Chinese workspace, AI 同事, OpenCode-backed model
connection, and plan-first coding collaboration.

## Phase E Snapshot

- [x] Settings exposes `模型连接` as the primary setup path.
- [x] OpenCode-backed model connection validation is implemented through the API.
- [x] AI teammate creation supports templates, custom profiles, memory,
      approvals, model preference, tools, and output style.
- [x] Coding work mode supports a selected recommended teammate set.
- [x] Deleted teammates are excluded from workflow launch.
- [x] Channel detail can recover from failed activity and keeps context across
      tabs.
- [x] Inbox, tasks, calendar, channels, members, billing, and capability
      management expose operational skeletons.
- [x] Expo mobile MVP covers login, conversation browsing, approval decisions,
      and artifact previews against the existing API surface.
- [x] Electron desktop MVP covers Web embedding, local file picking, system
      notification IPC, and local Agent process supervision IPC.
- [x] Deploy worker has real-provider adapters for Vercel static previews,
      Fly.io Machines container previews, and S3/R2 source-archive downloads.
- [ ] Real OpenCode-backed model key acceptance must still be run by a human.
- [x] Real Vercel/Fly/S3 or R2 deploy acceptance passed with
      operator-provided credentials on 2026-06-06.
- [ ] Mobile Android/iOS installable app acceptance must be recorded.
- [ ] Desktop Electron startup or package acceptance must be recorded.
- [ ] Human-recorded `3` minute demo video remains outstanding.
- [ ] Staging and formal load-test evidence remain outstanding.

## Original Competition Requirement Closeout

- [x] Product design document is available under `docs/product/`.
- [x] Technical documentation is available under `docs/architecture/`,
      `docs/operations/`, and `docs/agent harnessdesign/`.
- [x] Runnable demo paths are covered by the local web harness and demo runbooks.
- [x] AI collaboration records are available under `ai/logs/`, `ai/specs/`,
      `ai/tasks/`, and `ai/rules/`.
- [x] Original IM, multi-agent, artifact, deploy, and P2 shell requirements are
      tracked in `docs/product/original-requirements-coverage.md`.
- [ ] Human-recorded `3` minute demo video remains the only original competition
      deliverable outside the code/documentation repository.

The unchecked real-key, staging, and full k6 items below remain release gates.
They should not be reported as completed until a human operator runs the
secrets-backed acceptance and records the capacity evidence.

## Real Deploy Acceptance

Run this before claiming the deployment requirement is externally verified:

1. Populate `.env` or shell exports with `VERCEL_TOKEN`, optional
   `VERCEL_TEAM_ID`, optional `VERCEL_DEPLOY_TARGET` (`production` by default
   for public acceptance URLs), `FLY_API_TOKEN`, `FLY_ORG_SLUG`, `FLY_REGION`,
   `S3_ENDPOINT`, `S3_REGION`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_BUCKET`,
   `S3_PUBLIC_BASE_URL`, and a shared `CREDENTIAL_ENCRYPTION_KEY`.
2. Start `api` and `worker` with the same deploy/S3 environment, for example
   through `node --env-file=.env $(which pnpm) --filter api dev` and the
   matching worker command.
3. Run `node --env-file=.env $(which pnpm) deploy:acceptance:real`.
4. Confirm the report shows `PASSED` and includes one Vercel preview URL, one
   Fly.io `*.fly.dev` URL, and one public source-archive URL.
5. Preserve the report as release evidence.
6. Run `pnpm deploy:cleanup:real` with the cleanup exports printed by the
   acceptance report, or intentionally keep the source-archive URL as evidence.

An OpenCode-backed model key is not required by the deploy script itself, but it
remains required for the full coding collaboration demo.

## Production Target

- Concurrent web clients: `3 000`
- Concurrent AI teammate executions: `500`
- Browser stream transport: `HTTP + SSE`
- Current public model connection: OpenCode-backed 国产模型连接

## Functional Coverage

- [x] Model connection contract is covered in `packages/contracts`.
- [x] Claude Code adapter uses the official Claude Agent SDK path instead of a
      Miaochat-owned fake HTTP endpoint.
- [x] Codex adapter uses the official `@openai/codex-sdk` path instead of a
      Miaochat-owned fake HTTP endpoint.
- [x] OpenCode-backed connection validate/create/list flow is covered by
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
5. Add a real OpenCode-backed model key.
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
| `node --env-file=.env $(which pnpm) db:migrate` | All migrations apply with the same env loading path used by API/worker. |
| `pnpm --filter @agenthub/contracts build` | Contracts build. |
| `pnpm --filter api build` | API builds. |
| `pnpm --filter worker build` | Worker builds. |
| `pnpm --filter web build` | Web builds. |
| `pnpm exec vitest run tests/deploy-acceptance-support.spec.ts` | Real deploy acceptance script support passes with mocked provider/API calls. |
| `node --env-file=.env $(which pnpm) deploy:acceptance:real` | With real credentials and running API/worker, publishes Vercel/Fly/S3 artifacts and verifies public URLs. |
| `node --env-file=.env $(which pnpm) deploy:cleanup:real` | Removes generated Vercel/Fly resources; lists S3/R2 objects for manual cleanup/evidence retention. |
| `pnpm --filter mobile test` | Mobile API/client component tests pass. |
| `./node_modules/.bin/tsc -p apps/mobile/tsconfig.json --noEmit --pretty false` | Mobile TypeScript check passes. |
| `./node_modules/.bin/eslint apps/mobile/App.tsx apps/mobile/src apps/mobile/test` | Mobile lint passes. |
| `pnpm --filter mobile exec expo install --check` | Expo SDK dependency compatibility passes. |
| `EXPO_PUBLIC_API_BASE_URL=http://<device-reachable-api>:3001 pnpm mobile:android:release` | Android builds and installs Miaochat as a native app for device acceptance. |
| `EXPO_PUBLIC_API_BASE_URL=http://<device-reachable-api>:3001 pnpm mobile:ios:release` | iOS builds and installs Miaochat from the user's Mac/Xcode environment. |
| `EXPO_PUBLIC_API_BASE_URL=http://localhost:3001 pnpm --filter mobile start` | Development-only Metro smoke test; not final mobile delivery evidence. |
| `pnpm --filter desktop test` | Desktop shell, IPC, and supervisor tests pass. |
| `pnpm --filter desktop build` | Desktop Electron entry and preload build. |
| `pnpm --filter desktop lint` | Desktop lint passes. |
| `pnpm --filter web test` | Web component tests pass or report known open-handle issues. |
| `pnpm build` | Monorepo build passes. |
| `pnpm test:integration` | Integration suite passes against local test infra. |
| `pnpm exec vitest run tests/integration/deepseek-connection.spec.ts` | OpenCode-backed connection flow passes, including legacy DeepSeek compatibility. |
| `pnpm exec vitest run tests/integration/coding-workflow-execution.spec.ts` | Coding workflow execution path passes. |
| `pnpm test:load` | Placeholder runs cleanly until k6 scenarios are restored. |
