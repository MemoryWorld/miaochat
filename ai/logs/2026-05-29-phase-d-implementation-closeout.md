# Phase D Workspace Actor Platform Closeout

## Date

- 2026-05-29

## Skills Used

- `编程技能包`
- `using-agent-skills`
- `incremental-implementation`
- `test-driven-development`
- `frontend-ui-engineering`
- `api-and-interface-design`
- `debugging-and-error-recovery`
- `documentation-and-adrs`

## Scope

This turn completed the implementation tracked by
`ai/tasks/phase-d-workspace-actor-platform-tasks.md`.

## Main Delivery Areas

### 1. Workspace Shell Surfaces

Implemented and wired:

- inbox
- tasks
- calendar
- channel shell
- actor shell
- settings host

These now read from shared Phase D shell APIs instead of only static shell
copy.

### 2. Shared Contracts And Persistence

Added shared contracts for:

- execution planes
- approvals
- activity rounds
- memory records
- skill bindings
- workspace shell projections

Added persistence for:

- teammate-channel memberships
- workspace tasks
- calendar events
- approval requests
- activity rounds and steps
- memory records
- workspace skill bindings

### 3. Coding Workflow Refactor

The coding workflow is now embedded into Phase D primitives:

- plan approval uses `approval_requests`
- planning / execution / review / qa updates write `activity_rounds`
- actor self-memory is written for execution, review, and qa stages
- workspace summary memory is written on workflow completion

### 4. Runtime Boundary

Recorded the runtime boundary for:

- preferred backend `enhanced-hermes`
- compatibility backends
- blocked secondary backend `claude-code-internal`

See:

- `docs/architecture/phase-d-runtime-backend-boundaries.md`

## Bugs Found And Fixed During Closeout

### 1. Orchestrator State Drift

Problem:

- `coding-workflow-dispatch.service.ts` still handled `queued`, but the shared
  status contract no longer allowed it.

Fix:

- removed the stale branch and aligned the implementation with the contract

Guard:

- `pnpm --filter api build`

### 2. Incomplete Actor Memory Writes

Problem:

- only the engineering stage wrote actor self-memory
- review and qa still used bespoke execution code paths

Fix:

- moved review and qa to the shared `runStage(...)` path
- unified activity completion plus actor memory writing across all three
  execution stages

Guard:

- `tests/integration/coding-workflow-execution.spec.ts`

### 3. Actor Profile Membership Gap

Problem:

- actor profiles did not carry their channel memberships even though channel
  filters and memberships already existed

Fix:

- `getActorProfile(...)` now derives and returns scoped channel memberships for
  built-in and custom teammates

Guard:

- `tests/integration/workspace-shell-api.spec.ts`

## Verification

Passed during closeout:

- `pnpm db:migrate`
- `pnpm --filter @agenthub/contracts test`
- `pnpm --filter @agenthub/contracts build`
- `pnpm --filter api build`
- `pnpm --filter worker build`
- `pnpm --filter worker test`
- `pnpm --filter web test`
- `pnpm --filter web build`
- `pnpm exec vitest run tests/integration/workspace-shell-api.spec.ts tests/integration/coding-workflow-api.spec.ts tests/integration/coding-workflow-execution.spec.ts tests/integration/phase-a-runtime-baseline.spec.ts`

Additional focused verification:

- `pnpm --filter web exec vitest run src/features/teammates/teammate-actor-page.spec.tsx src/features/channels/channel-shell.spec.tsx`

## Outcome

The repo now has a working Phase D shell with:

- Chinese-first workspace navigation
- first-class inbox, tasks, calendar, channels, and AI teammates
- actor-scoped surfaces backed by shared APIs
- coding workflow activity, approvals, memory, and files flowing into the new
  shell
- explicit preferred-vs-compatibility runtime boundaries
