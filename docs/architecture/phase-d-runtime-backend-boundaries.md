# Phase D Runtime Backend Boundaries

## Objective

Phase D keeps runtime details out of the customer shell, but it still needs a
clear internal contract for how built-in `AI 同事` execute.

This document records that boundary.

## Product-Level Rule

The customer-facing shell talks about:

- `AI 同事`
- `同事工作台`
- `任务`
- `活动`
- `审批`
- `记忆`

It does **not** talk about raw provider brands in the normal journey.

## Runtime Backends

The shared runtime backend enum currently includes:

- `enhanced-hermes`
- `hermes-compat`
- `openclaw-compat`
- `claude-code-internal`
- `mock`

Only the first three are executable in the current Phase D implementation.

## Preferred Backend

### `enhanced-hermes`

This remains the preferred built-in backend.

Why:

- it supports the current internal runtime bridge cleanly
- it aligns with the memory-aware and context-aware execution model from the
  local enhanced Hermes research
- it keeps the product story focused on built-in teammates rather than
  compatibility transports

Current behavior:

- `技术负责人` and `代码评审` run on the `in_process` execution plane
- `软件工程师` and `测试工程师` run on the `isolated_workspace` execution plane
- the worker reuses cached pinned context via async prefetch
- each execution stage writes structured activity rounds
- each execution stage writes actor self-memory
- completed workflows write one workspace-level memory summary

## Compatibility Backends

### `hermes-compat`

- explicit fallback for older Hermes-shaped transport paths
- still resolves to provider transport `hermes`
- not part of the main customer-facing story

### `openclaw-compat`

- explicit compatibility fallback when a workspace only has OpenClaw available
- still resolves to provider transport `openclaw`
- remains available for Phase A and compatibility flows

## Secondary Coding Backend Boundary

### `claude-code-internal`

This backend is intentionally **bounded by contract only** in Phase D.

Current status:

- the enum exists
- worker readiness tests cover the blocked behavior
- the registry throws a clear error when execution is attempted

This is deliberate. The product may acknowledge that a deeper coding-session
backend exists in the architecture, but the runtime does not pretend it is
implemented before the local source snapshot is intentionally integrated.

## Worker Path

The preferred execution path is:

`workspace shell -> coding workflow decision -> api dispatch -> Temporal workflow -> internal runtime registry -> preferred backend`

Key worker modules:

- `apps/worker/src/activities/internal-runtime-registry.ts`
- `apps/worker/src/activities/internal-runtime-agent.activity.ts`
- `apps/worker/src/workflows/internal-runtime-agent.workflow.ts`

Key API orchestration modules:

- `apps/api/src/modules/coding-workflows/coding-workflow-dispatch.service.ts`
- `apps/api/src/modules/workspace-shell/workspace-shell.service.ts`

## Why This Boundary Matters

Phase D adds inbox, actor shell, tasks, calendar, approvals, files, skills,
and memory on top of the same runtime substrate.

Without a documented boundary:

- compatibility transports could leak back into the product story
- the blocked secondary backend could look half-implemented instead of
  intentionally deferred
- execution-plane behavior would be hard to reason about during future coding
  session work

This document keeps those lines explicit.
