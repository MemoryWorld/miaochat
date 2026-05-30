# Tasks: Phase C Built-In Agent Coding Workspace

## Task Status

This task list is derived from
[ai/plans/phase-c-built-in-agent-coding-workspace-plan.md](../plans/phase-c-built-in-agent-coding-workspace-plan.md).

## Phase C0: Alignment And Safety

- [x] Task C00: Record the `/agents` page crash and prevention rule
  - Acceptance: Repo contains a durable bug log with root cause, fix, and
    recurrence guard.
  - Verify: review
    [ai/logs/2026-05-28-agents-page-auth-shape-bug.md](../logs/2026-05-28-agents-page-auth-shape-bug.md)

- [x] Task C01: Freeze the active built-in-agent product direction in a new spec
  - Acceptance: The active spec states Chinese-first, built-in roles, work-mode
    entry, plan gate, and internal runtime boundaries.
  - Verify: review
    [ai/specs/2026-05-28-phase-c-built-in-agent-coding-workspace.md](../specs/2026-05-28-phase-c-built-in-agent-coding-workspace.md)

## Phase C1: Entry And Product Language

- [x] Task C02: Replace the post-login primary CTA with a work-mode launcher
  - Acceptance: The first clear action after login is `选择工作模式`, not raw
    chat creation or provider setup.
  - Verify: `pnpm --filter web test` and manual shell review
  - Files: `apps/web/src/app/*`, `apps/web/src/features/chat/*`,
    `apps/web/src/features/workmodes/*`

- [x] Task C03: Introduce the `编码` mode starter flow
  - Acceptance: A user can start a coding workflow from a dedicated launcher
    surface with Chinese-first copy.
  - Verify: targeted web tests and `pnpm --filter web build`
  - Files: `apps/web/src/features/workmodes/*`, `apps/web/src/components/*`

## Phase C2: Built-In AI Teammates

- [x] Task C04: Reframe `/agents` into an `AI 同事` directory
  - Acceptance: The page centers teammate role, mission, and responsibility
    instead of provider identity.
  - Verify: `pnpm --filter web test`
  - Files: `apps/web/src/app/agents/*`, `apps/web/src/features/agents/*`

- [x] Task C05: Add the default coding team cards
  - Acceptance: 技术负责人 / 软件工程师 / 代码评审 / 测试工程师 all appear as
    built-in teammate templates with role descriptions.
  - Verify: targeted web tests plus manual page review
  - Files: `apps/web/src/features/agents/*`, `docs/product/*`

- [x] Task C06: Preserve user-defined AI teammate creation under the new model
  - Acceptance: Users can still define teammates, but the form speaks in role
    and mission terms rather than provider-first terms.
  - Verify: `pnpm --filter web test`
  - Files: `apps/web/src/features/agents/*`, `packages/contracts/*`

## Phase C3: Coding Workflow Template

- [x] Task C07: Add a coding workflow template API/contract
  - Acceptance: One product-level request can create a coding workflow with the
    default built-in team and initial state.
  - Verify: API tests and `pnpm --filter api build`
  - Files: `apps/api/src/modules/*`, `packages/contracts/*`

- [x] Task C08: Make the tech lead produce a visible plan first
  - Acceptance: Newly created coding workflows begin in `计划待确认` and show a
    plan authored by `技术负责人`.
  - Verify: integration tests plus manual seeded flow review
  - Files: `apps/worker/src/*`, `apps/web/src/features/chat/*`,
    `tests/integration/*`

- [x] Task C09: Add approve / reject / revise actions for the plan gate
  - Acceptance: A human can decide whether the workflow may proceed into
    execution.
  - Verify: web tests, API build, worker build
  - Files: `apps/web/src/features/chat/*`, `apps/api/src/modules/*`,
    `apps/worker/src/*`

## Phase C4: Execution Visibility

- [x] Task C10: Surface execution, review, and QA stages in one shared timeline
  - Acceptance: The product makes it obvious which teammate is acting and which
    phase the workflow is in.
  - Verify: `pnpm --filter web test` and integration tests
  - Files: `apps/web/src/features/chat/*`, `packages/contracts/*`

- [x] Task C11: Add a Chinese task-state layer for coding workflows
  - Acceptance: Users can see `待办 / 进行中 / 待审核 / 已完成` in the same
    product loop as messages and approvals.
  - Verify: targeted web tests and API build
  - Files: `apps/web/src/features/tasks/*`, `apps/api/src/modules/*`,
    `packages/contracts/*`

- [x] Task C12: Add approval cards for high-risk actions
  - Acceptance: Sensitive actions stop for human confirmation and render clear
    approval history.
  - Verify: workflow integration tests and manual review
  - Files: `apps/web/src/features/chat/*`, `apps/worker/src/*`,
    `tests/integration/*`

## Phase C5: Internal Runtime Migration

- [x] Task C13: Spec and implement the internal runtime backend registry
  - Acceptance: Built-in teammates bind to internal runtime backends without
    leaking provider names into the product shell.
  - Verify: worker build and adapter tests
  - Files: `packages/agent-adapters/*`, `apps/worker/src/*`,
    `packages/contracts/*`

- [x] Task C14: Shape `enhanced-hermes` as the preferred built-in runtime path
  - Acceptance: The repo has one clear integration path for the morph-labs
    Hermes fork under the internal runtime abstraction.
  - Verify: provider-specific integration tests
  - Files: `packages/agent-adapters/*`, `tests/integration/*`,
    `docs/architecture/*`

- [x] Task C15: Prepare the Claude internal runtime compatibility contract
  - Acceptance: The contract is defined, but implementation remains blocked
    until the user supplies the old Claude source tree.
  - Verify: spec and contract review
  - Files: `ai/specs/*`, `packages/contracts/*`, `docs/architecture/*`

## Checkpoint

- [x] The main shell reads as a Chinese AI workforce product
- [x] Provider names are no longer central in the normal customer journey
- [x] The coding workflow starts with a tech-lead plan gate
- [x] Built-in teammates are clearer than runtime backends
- [x] `pnpm --filter web build`
- [x] `pnpm --filter api build`
- [x] `pnpm --filter worker build`
- [x] `pnpm exec vitest run tests/integration/phase-a-runtime-baseline.spec.ts`
