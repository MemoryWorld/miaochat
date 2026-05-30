# Tasks: Phase C Chinese AI Workforce Overhaul

## Task Status

This task list is derived from
[ai/plans/phase-c-chinese-ai-workforce-overhaul-plan.md](../plans/phase-c-chinese-ai-workforce-overhaul-plan.md).

It intentionally splits the program into a first implementation wave and later
phases. The current active coding target should start from `C03`.

## Phase C0: Strategy And Guardrails

- [x] Task C01: Record the overhaul spec, plan, task file, and decision log
  - Acceptance: Repo contains a dedicated active milestone for the Chinese
    AI-workspace rebuild.
  - Verify: Open the new files under `ai/specs`, `ai/plans`, `ai/tasks`, and
    `ai/logs`.

- [x] Task C02: Freeze the high-level product direction and guardrails
  - Acceptance: The active spec explicitly states Chinese-first scope,
    runtime-preservation, and the no-verbatim-copy rule.
  - Verify: Review the assumptions, boundaries, and success criteria in the
    new spec.

## Phase C1: First Execution Wave

- [x] Task C03: Freeze Chinese primary navigation and workspace vocabulary
  - Acceptance: One approved vocabulary set exists for the top nav, sidebar,
    task states, teammate labels, and settings entry points.
  - Verify: Publish the chosen terms in the milestone log or a product copy
    appendix before UI implementation starts.
  - Files: `docs/product/*`, `ai/logs/*`, `apps/web/src/features/*`

- [x] Task C04: Redesign the top-level web shell into a workspace-first layout
  - Acceptance: The app stops presenting itself as a demo/setup-first tool on
    first load and instead frames the product as a Chinese AI teammate
    workspace.
  - Verify: `pnpm --filter web test` and manual shell review.
  - Files: `apps/web/src/app/*`, `apps/web/src/components/*`,
    `apps/web/src/features/chat/*`

- [ ] Task C05: Demote provider setup into a secondary settings path
  - Acceptance: `/setup` remains usable, but the primary shell no longer
    funnels users into raw provider forms as the first product story.
  - Verify: `pnpm exec vitest run apps/web/src/features/setup/setup-flow.spec.tsx`
  - Files: `apps/web/src/app/setup/*`, `apps/web/src/features/setup/*`,
    `apps/web/src/features/chat/*`

- [ ] Task C06: Introduce a channel-style left rail using compatibility data
  - Acceptance: Existing conversations can be rendered as channel-like entries
    without breaking current persistence or runtime dispatch.
  - Verify: `pnpm --filter web test` plus manual navigation through seeded
    data.
  - Files: `apps/web/src/features/chat/*`, `packages/contracts/*`,
    `tests/integration/*`

- [ ] Task C07: Reframe the main timeline as a channel surface with Chinese
  tabs
  - Acceptance: The main content area supports channel-oriented copy and tabs
    such as chat/files/pinned in Chinese, even if the underlying data model is
    still compatibility-driven.
  - Verify: targeted web tests plus manual review.
  - Files: `apps/web/src/features/chat/*`, `apps/web/src/components/*`

- [ ] Task C08: Surface AI teammates as first-class visible members
  - Acceptance: Seeded agents stop looking like raw provider configurations and
    instead appear as named AI teammates with roles.
  - Verify: web tests and manual seeded-shell check.
  - Files: `apps/web/src/features/agents/*`, `apps/web/src/features/chat/*`,
    `docs/product/*`

## Checkpoint: Shell Review

- [ ] The shell reads as a Chinese workspace product rather than a provider
      demo.
- [ ] `pnpm --filter web build`
- [ ] `pnpm --filter api build`
- [ ] `pnpm --filter worker build`
- [ ] `pnpm exec vitest run tests/integration/phase-a-runtime-baseline.spec.ts`

## Phase C2: Product Model Expansion

- [ ] Task C09: Spec the channel data model and compatibility path
  - Acceptance: A follow-on spec exists for whether channels replace or wrap
    conversations.
  - Verify: new spec file reviewed before schema work.

- [ ] Task C10: Introduce the task system surface
  - Acceptance: The workspace has a real task list/board with visible state and
    ownership.
  - Verify: task-specific tests and web build.

- [ ] Task C11: Introduce coding-session visibility
  - Acceptance: The product can show work-in-progress execution as a session,
    not only as free-form messages.
  - Verify: integration tests plus manual artifact review.

- [ ] Task C12: Introduce approval cards for sensitive actions
  - Acceptance: Reviewable human approval becomes a visible product pattern.
  - Verify: UI tests and workflow verification.

## Phase C3: Deferred Later Work

- [ ] Task C13: Email and meeting surfaces
  - Acceptance: External communication surfaces become visible product
    capabilities.
  - Verify: later milestone.

- [ ] Task C14: Provider expansion after the shell gap is closed
  - Acceptance: `Codex`, `Claude Code`, and `morph-labs/hermes-agent-fork`
    re-enter scope only after the product model is stable.
  - Verify: later milestone.
