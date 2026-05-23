# AgentHub Release 1 — Execution Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Ship AgentHub Release 1 (v1.0.0) — multi-agent collaboration platform with Hermes, OpenClaw, Codex, and Claude Code providers.

**Architecture:** Monorepo (pnpm workspaces) — Next.js web app, Node.js API, Temporal worker, PostgreSQL + Redis + object storage. Packages: contracts, config, observability-errors, observability-otel.

**Tech Stack:** TypeScript, pnpm, Vitest, Playwright, k6, Drizzle ORM, Tailwind CSS, Temporal, SSE streaming.

---

## Current Status (May 24, 2026)

- Branch: `feat/post-release-1-tasks-37-57`
- No release tags yet
- `contracts` and `config` packages: tests pass individually
- `observability-errors` and `observability-otel`: **BROKEN** — missing `vitest.config.ts`, no test files, no `node_modules`
- Hardening items H-05 through H-10: checked off
- Functional, real-provider, load, and observability checklist items: all unchecked

---

## Phase 1: Fix Build & Test Baseline (BLOCKER)

### Task 1.1: Fix observability-errors package

**Objective:** Create vitest.config.ts and a minimal test so the package builds and tests pass.

**Files:**
- Create: `packages/observability-errors/vitest.config.ts`
- Create: `packages/observability-errors/test/index.spec.ts`
- Create: `packages/observability-errors/node_modules/` (via `pnpm install` in the workspace)

**Steps:**
1. Check `packages/observability-errors/src/` for exported functions
2. Create `vitest.config.ts` (copy pattern from `packages/contracts/vitest.config.ts`)
3. Create a smoke test that imports the package and asserts exports exist
4. Run: `cd packages/observability-errors && pnpm test`
5. Commit: `fix: add vitest config and smoke test for observability-errors`

### Task 1.2: Fix observability-otel package

**Objective:** Same as 1.1 — create vitest.config.ts and minimal test.

**Files:**
- Create: `packages/observability-otel/vitest.config.ts`
- Create: `packages/observability-otel/test/index.spec.ts`

**Steps:**
1. Check `packages/observability-otel/src/` for exported functions
2. Create `vitest.config.ts`
3. Create smoke test
4. Run: `cd packages/observability-otel && pnpm test`
5. Commit: `fix: add vitest config and smoke test for observability-otel`

### Task 1.3: Verify clean pnpm test

**Objective:** All 7 workspace test suites pass.

**Steps:**
1. Run: `pnpm test`
2. Expected: 7/7 pass, 0 failed
3. Commit if any cleanup was needed

---

## Phase 2: Integration Tests

### Task 2.1: Run integration suite

**Steps:**
1. Run: `pnpm test:integration`
2. Fix any failures (likely infra-dependent — PostgreSQL, Redis)
3. If infra not available, run with mock adapters
4. Record results
5. Commit fixes

---

## Phase 3: E2E Tests

### Task 3.1: Run smoke e2e suite

**Steps:**
1. Run: `pnpm test:e2e:smoke`
2. Fix any failures
3. Record results

### Task 3.2: Run Playwright e2e suite

**Steps:**
1. Run: `pnpm test:e2e`
2. Fix any failures
3. Record results

### Task 3.3: Run real-provider specs against local replay

**Steps:**
1. Run: `pnpm test:e2e:providers`
2. Fix any failures
3. Record results

---

## Phase 4: Load Tests

### Task 4.1: Run k6 load scenarios

**Steps:**
1. Run each: `k6 run tests/load/session-list.js`, `send-message.js`, `group-orchestration.js`, `stream-stability.js`
2. Verify k6 thresholds pass
3. Record results in `docs/operations/load-test-results.md`

---

## Phase 5: Observability & Health Checks

### Task 5.1: Verify health endpoints

**Steps:**
1. Start API server
2. `curl localhost:3000/health/liveness` → 200
3. `curl localhost:3000/health/readiness` → 200
4. `curl localhost:3000/metrics` → Prometheus metrics

---

## Phase 6: Release Cut

### Task 6.1: Merge to main and tag

**Steps:**
1. Merge `feat/post-release-1-tasks-37-57` → `main`
2. Tag: `git tag -a v1.0.0 -m "AgentHub Release 1"`
3. Push: `git push origin main --tags`

---

## Phase 7: Deploy

### Task 7.1: Build production images

**Steps:**
1. Build Docker images for api, web, worker
2. Tag and push to registry

### Task 7.2: Deploy stack

**Steps:**
1. Deploy PostgreSQL (with pgBouncer), Redis, Temporal, object storage
2. Deploy API, web, worker services
3. Verify health endpoints return 200
4. Run smoke tests against production

---

## Critical Path

```
Phase 1 (fix builds) → Phase 2 (integration) → Phase 3 (e2e) → Phase 4 (load) → Phase 5 (obs) → Phase 6 (tag) → Phase 7 (deploy)
```

Phase 1 is the immediate blocker. Once builds are green, the rest is verification and sign-off.
