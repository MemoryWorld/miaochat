# Tasks: Phase D Workspace Actor Platform

## Task Status

This task list is derived from
[ai/plans/phase-d-workspace-actor-platform-plan.md](../plans/phase-d-workspace-actor-platform-plan.md).

## Phase D0: Guardrails And Vocabulary

- [x] Task D00: Record the naming and local-reference guardrails
  - Acceptance: Repo contains a durable note that the external benchmark brand
    stays out of generated code, product copy, and route names.
  - Verify: review `ai/logs/*phase-d*`

- [x] Task D01: Freeze the Phase D Chinese product vocabulary
  - Acceptance: The repo has one authoritative vocabulary covering shell,
    actors, tasks, calendar, approvals, files, skills, and memory.
  - Verify: review `docs/product/*`

- [x] Task D02: Freeze the Phase D route family map
  - Acceptance: The repo defines the route families for inbox, tasks, calendar,
    channels, teammates, teammate tabs, and settings sections.
  - Verify: spec and route contract review

## Phase D1: Workspace Shell Rewrite

- [x] Task D03: Build the persistent workspace shell layout
  - Acceptance: A logged-in user lands in one stable shell with route outlet,
    left navigation, and top utility strip.
  - Verify: `pnpm --filter web test` and `pnpm --filter web build`
  - Files: `apps/web/src/app/*`, `apps/web/src/components/*`

- [x] Task D04: Add workspace switcher, account menu, and navigation groups
  - Acceptance: The shell visibly groups inbox, tasks, calendar, channels, AI
    teammates, and direct messages.
  - Verify: targeted web tests and manual route review
  - Files: `apps/web/src/features/workspaces/*`, `apps/web/src/components/*`

- [x] Task D05: Move setup and provider controls behind advanced settings
  - Acceptance: Credentials and runtime bindings are no longer part of the main
    product entry loop.
  - Verify: web tests plus route smoke review
  - Files: `apps/web/src/features/setup/*`, `apps/web/src/app/settings/*`

## Phase D2: Shared Data Primitives

- [x] Task D06: Add shared contracts for inbox, task, calendar, actor profile,
      activity round, and approval entities
  - Acceptance: The repo has versioned contracts for the new Phase D page
    families and activity model.
  - Verify: typecheck and contract review
  - Files: `packages/contracts/*`

- [x] Task D07: Extend persistence for workspace members, actor shells,
      activity rounds, approvals, and file surfaces
  - Acceptance: DB schema supports the new shell-level entities without
    deleting existing conversation or coding workflow data.
  - Verify: `pnpm db:migrate` and schema review
  - Files: `db/migrations/*`, `db/schema.ts`

- [x] Task D08: Add compatibility adapters from current conversations and
      coding workflows to Phase D projections
  - Acceptance: Existing data can appear inside the new shell without a full
    destructive migration.
  - Verify: integration tests and manual seeded flow review
  - Files: `apps/api/src/modules/*`, `packages/domain/*`

## Phase D3: Inbox, Task, And Calendar Families

- [x] Task D09: Implement the shared inbox surface
  - Acceptance: Inbox can render approvals, teammate requests, and workflow
    updates in one list/detail experience.
  - Verify: web tests and API build
  - Files: `apps/web/src/features/inbox/*`, `apps/api/src/modules/inbox/*`

- [x] Task D10: Implement the shared task system with list and board views
  - Acceptance: Tasks render in one reusable view with workspace and teammate
    scopes.
  - Verify: web tests, API build, integration tests
  - Files: `apps/web/src/features/tasks/*`, `apps/api/src/modules/tasks/*`

- [x] Task D11: Implement the shared calendar system with month/week/day views
  - Acceptance: Calendar renders as one reusable engine with user, workspace,
    and teammate owner scopes.
  - Verify: web tests and API build
  - Files: `apps/web/src/features/calendar/*`, `apps/api/src/modules/calendar/*`

## Phase D4: Actor Shell

- [x] Task D12: Implement the generic actor shell and tab registry
  - Acceptance: Every AI teammate page uses one shared shell with tab-driven
    content slots.
  - Verify: web tests and route review
  - Files: `apps/web/src/features/teammates/*`, `apps/web/src/app/teammates/*`

- [x] Task D13: Reframe current AI teammate pages into actor pages
  - Acceptance: The product centers actor identity, mission, and ownership
    instead of raw provider configuration.
  - Verify: web tests and manual page review
  - Files: `apps/web/src/app/agents/*`, `apps/web/src/app/teammates/*`

- [x] Task D14: Add actor-scoped task, activity, calendar, channel, file,
      skill, memory, and settings tabs
  - Acceptance: Each tab is reachable and correctly scoped by teammate ID.
  - Verify: route smoke tests and integration tests
  - Files: `apps/web/src/features/teammates/*`, `apps/api/src/modules/*`

## Phase D5: Channels And Files

- [x] Task D15: Promote channels to first-class workspace navigation entries
  - Acceptance: Channels appear alongside inbox, tasks, calendar, and
    teammates in the shell.
  - Verify: web tests and manual shell review
  - Files: `apps/web/src/features/channels/*`

- [x] Task D16: Build the channel shell with chat and files tabs
  - Acceptance: A channel page exposes both timeline and scoped file surface.
  - Verify: web build, API build, manual seeded review
  - Files: `apps/web/src/features/channels/*`, `apps/api/src/modules/channels/*`

- [x] Task D17: Add teammate-to-channel membership and visibility rules
  - Acceptance: AI teammates can be explicitly attached to channels and their
    actor pages reflect those memberships.
  - Verify: integration tests and API build
  - Files: `apps/api/src/modules/channels/*`, `apps/api/src/modules/teammates/*`

## Phase D6: Structured Teammate Creation

- [x] Task D18: Replace the flat teammate form with a structured wizard
  - Acceptance: Teammate creation becomes a multi-step flow for role, mission,
    scope, skills, memory, and runtime.
  - Verify: web tests and manual wizard review
  - Files: `apps/web/src/features/agents/*`, `apps/web/src/features/teammates/*`

- [x] Task D19: Add built-in template catalog and work-mode-aware defaults
  - Acceptance: Users can start from strong teammate templates instead of a
    blank configuration.
  - Verify: targeted web tests and contract review
  - Files: `packages/contracts/*`, `apps/web/src/features/teammates/*`

- [x] Task D20: Preserve custom teammate creation under the new actor model
  - Acceptance: User-defined teammates still work, but the creation language is
    role-first and workspace-first.
  - Verify: web tests and API build
  - Files: `apps/api/src/modules/custom-agents/*`, `apps/web/src/features/agents/*`

## Phase D7: Activity And Approval System

- [x] Task D21: Add persisted activity rounds and round steps
  - Acceptance: Teammate execution produces structured activity records, not
    only plain messages.
  - Verify: API tests and integration tests
  - Files: `apps/api/src/modules/activity/*`, `db/*`

- [x] Task D22: Add structured approval request and response cards
  - Acceptance: Plans and high-risk actions render as typed approval cards in
    the timeline and actor views.
  - Verify: web tests and integration tests
  - Files: `apps/web/src/features/approvals/*`, `packages/contracts/*`

- [x] Task D23: Feed approvals into inbox, actor activity, and channel context
  - Acceptance: Approval items are visible from all relevant scopes without
    duplication or ambiguity.
  - Verify: integration tests and manual seeded flows
  - Files: `apps/api/src/modules/inbox/*`, `apps/api/src/modules/activity/*`

- [x] Task D24: Refactor coding-plan approvals to the shared approval system
  - Acceptance: The existing plan gate uses the same Phase D approval
    primitives as the rest of the product.
  - Verify: coding workflow integration tests
  - Files: `apps/api/src/modules/coding-workflows/*`, `apps/web/src/features/chat/*`

## Phase D8: Internal Runtime Evolution

- [x] Task D25: Define execution-plane contracts for in-process, isolated
      workspace, and deferred remote sessions
  - Acceptance: The runtime layer can describe different teammate execution
    planes without leaking provider branding into the shell.
  - Verify: contract review and worker build
  - Files: `packages/contracts/*`, `apps/worker/src/*`

- [x] Task D26: Map planning and review teammates to the lightweight execution
      plane
  - Acceptance: Text-heavy coordination roles do not require the same session
    model as engineering execution.
  - Verify: worker tests and integration tests
  - Files: `apps/worker/src/*`

- [x] Task D27: Map engineering execution to an isolated workspace session
  - Acceptance: Software engineering work runs in a richer coding-session
    execution path with clear transcript and artifact boundaries.
  - Verify: integration tests and worker build
  - Files: `apps/worker/src/*`, `apps/api/src/modules/coding-workflows/*`

- [x] Task D28: Keep compatibility backends as explicit fallback only
  - Acceptance: Compatibility transports remain available but are no longer the
    product story.
  - Verify: runtime tests and docs review
  - Files: `apps/worker/src/*`, `docs/architecture/*`

## Phase D9: Memory And Skill System

- [x] Task D29: Add workspace team memory contracts and persistence
  - Acceptance: Shared memory exists at workspace or repo scope and can be
    surfaced in the UI.
  - Verify: API tests and docs review
  - Files: `packages/contracts/*`, `apps/api/src/modules/memory/*`

- [x] Task D30: Add actor memory and session memory surfaces
  - Acceptance: Actor pages can show persistent memory plus session-derived
    memory summaries.
  - Verify: web tests and integration tests
  - Files: `apps/web/src/features/memory/*`, `apps/api/src/modules/memory/*`

- [x] Task D31: Adopt async runtime context prefetch and actor self-memory for
      the preferred backend
  - Acceptance: The preferred runtime path uses cached turn-to-turn context
    rather than blocking every prompt build.
  - Verify: runtime integration tests and docs review
  - Files: `packages/agent-adapters/*`, `apps/worker/src/*`, `docs/architecture/*`

- [x] Task D32: Add visible skill surfaces and teammate-to-skill bindings
  - Acceptance: Skills are visible product capabilities with teammate bindings
    and workspace enablement.
  - Verify: web tests, API build, docs review
  - Files: `apps/web/src/features/skills/*`, `apps/api/src/modules/skills/*`

## Phase D10: Settings, Credentials, Billing, Marketplace

- [x] Task D33: Convert settings into a section-driven host
  - Acceptance: Profile, workspace, members, credentials, billing, and
    marketplace are sections in one coherent settings surface.
  - Verify: web tests and route review
  - Files: `apps/web/src/app/settings/*`, `apps/web/src/features/settings/*`

- [x] Task D34: Add workspace members with AI teammates as first-class entries
  - Acceptance: Human and AI members can appear in one membership model.
  - Verify: API tests and manual settings review
  - Files: `apps/api/src/modules/workspaces/*`, `apps/web/src/features/settings/*`

- [x] Task D35: Demote BYOK credentials to an advanced admin path
  - Acceptance: Credential management exists, but it no longer dominates the
    main product journey.
  - Verify: web tests and API build
  - Files: `apps/web/src/features/setup/*`, `apps/web/src/features/settings/*`

- [x] Task D36: Add billing and marketplace scaffolding aligned with the new
      shell
  - Acceptance: The shell can represent usage, billing, and marketplace
    sources even if some backends remain placeholder.
  - Verify: web build and docs review
  - Files: `apps/web/src/features/settings/*`, `docs/product/*`

## Phase D11: Verification And Cutover

- [x] Task D37: Add shell-level route and navigation tests
  - Acceptance: The main navigation and route families are covered by tests.
  - Verify: `pnpm --filter web test`
  - Files: `apps/web/src/app/*`

- [x] Task D38: Add actor-shell integration tests
  - Acceptance: Actor tabs, scope injection, and activity rendering are covered
    by tests.
  - Verify: targeted web tests and API integration tests
  - Files: `tests/integration/*`, `apps/web/src/features/teammates/*`

- [x] Task D39: Add inbox/task/calendar integration coverage
  - Acceptance: Shared primitives are verified across workspace and teammate
    scopes.
  - Verify: `pnpm exec vitest run tests/integration/*`
  - Files: `tests/integration/*`

- [x] Task D40: Add runtime-path integration coverage for the preferred backend
  - Acceptance: The preferred runtime path is tested for activity, approvals,
    memory, and coding workflow execution.
  - Verify: runtime integration tests
  - Files: `tests/integration/*`, `packages/agent-adapters/*`

- [x] Task D41: Add readiness tests for the secondary coding backend contract
  - Acceptance: The contract is testable and explicitly reports readiness gaps
    without pretending implementation is complete.
  - Verify: worker tests and docs review
  - Files: `apps/worker/test/*`, `docs/architecture/*`

## Exit Criteria

- [x] The main shell reads as a Chinese workspace operating system
- [x] Inbox, tasks, calendar, channels, and AI teammates are first-class routes
- [x] AI teammates are first-class workspace members and actor shells
- [x] Coding workflows are embedded inside the new shell instead of living as a
      special-case page
- [x] Activity and approvals are visible outside chat alone
- [x] `enhanced-hermes` remains the preferred built-in runtime path
- [x] `claude-code-internal` has a clear bounded role in the architecture
- [x] `pnpm --filter web build`
- [x] `pnpm --filter api build`
- [x] `pnpm --filter worker build`
