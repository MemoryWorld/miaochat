# Tasks: Phase A Hermes + OpenClaw Baseline

## Task Status

This task list is derived from
[ai/plans/phase-a-hermes-openclaw-baseline-plan.md](../plans/phase-a-hermes-openclaw-baseline-plan.md).

It is the recommended execution order for the next coding phase. It does not
replace the full Release 1 task history in
[release-1-web-mvp-tasks.md](./release-1-web-mvp-tasks.md).

## Phase 1: Milestone Alignment

- [x] Task A01: Record the Phase A milestone spec, plan, and tasks
  - Acceptance: The repo contains a milestone-specific spec, plan, and task
    breakdown that explicitly scopes to `Hermes` and `OpenClaw`.
  - Verify: Open the three milestone documents and confirm deferred scope lists
    `Codex`, `Claude Code`, and `morph-labs/hermes-agent-fork`.
  - Files: `ai/specs/2026-05-28-phase-a-hermes-openclaw-baseline.md`,
    `ai/plans/phase-a-hermes-openclaw-baseline-plan.md`,
    `ai/tasks/phase-a-hermes-openclaw-baseline-tasks.md`

- [x] Task A02: Align milestone-facing doc indexes and status notes
  - Acceptance: Repo entrypoints clearly distinguish the full Release 1 target
    from the active `Phase A` execution milestone.
  - Verify: Review `ai/specs/README.md`, `ai/tasks/README.md`, and the
    milestone log for discoverability and terminology consistency.
  - Files: `ai/specs/README.md`, `ai/tasks/README.md`, `ai/logs/*.md`

## Checkpoint: Scope Locked

- [x] Deferred providers are explicit, not implied.
- [x] No business-code tasks have started before scope alignment is approved.

## Phase 2: Runtime Foundation

- [x] Task A03: Add a provider adapter factory for supported runtime providers
  - Acceptance: Worker-side runtime selection for `mock`, `hermes`, and
    `openclaw` is centralized behind one factory boundary.
  - Verify: `pnpm --filter @agenthub/agent-adapters test`; targeted worker
    tests proving provider selection.
  - Files: `packages/agent-adapters/src/index.ts`,
    `apps/worker/src/activities/*`, any new shared runtime factory module

- [x] Task A04: Remove direct conversation mock-only gating for supported providers
  - Acceptance: API direct-message dispatch accepts conversations backed by
    `Hermes` or `OpenClaw` instead of rejecting every non-mock provider.
  - Verify: `pnpm test:integration` with direct-conversation coverage.
  - Files: `apps/api/src/modules/messages/message-dispatch.service.ts`,
    relevant integration specs

## Checkpoint: Runtime Backbone

- [x] The direct path no longer depends on a hardcoded `mock` restriction.
- [x] Provider routing logic exists in one auditable place.

## Phase 3: Direct And Group Runtime Wiring

- [x] Task A05: Route direct-agent execution through the provider factory
  - Acceptance: Direct execution uses the selected real adapter for `Hermes`
    and `OpenClaw`, while preserving the existing mock path for tests.
  - Verify: worker tests plus a targeted direct-flow integration test.
  - Files: `apps/worker/src/activities/direct-agent.activity.ts`,
    `apps/worker/test/*.spec.ts`, `tests/integration/*.spec.ts`

- [x] Task A06: Route group dispatch through the provider factory
  - Acceptance: Group orchestration dispatch uses the same runtime selection
    logic and preserves structured failure behavior.
  - Verify: `pnpm test:integration`; worker activity tests for provider-aware
    dispatch.
  - Files: `apps/worker/src/activities/dispatch-agent.activity.ts`,
    `apps/worker/src/activities/failure-handling.activity.ts`,
    `tests/integration/group-failure.spec.ts`

## Checkpoint: Real Runtime Path

- [x] Direct and group execution share the same provider-routing boundary.
- [x] Observability and failure handling still behave correctly.

## Phase 4: Acceptance Closure

- [x] Task A07: Prove Hermes/OpenClaw runtime acceptance end-to-end
  - Acceptance: The supported baseline has verifiable coverage for direct chat,
    group orchestration, pinned context replay, and normalized stream events.
  - Verify: `pnpm test:integration`; `pnpm test:e2e`;
    `pnpm test:e2e:providers`
  - Files: `tests/integration/*.spec.ts`, `tests/e2e/*-real.spec.ts`,
    `docs/operations/provider-acceptance.md`

- [x] Task A08: Verify the minimal BYOK setup path for Hermes/OpenClaw
  - Acceptance: The user can complete the setup flow for the two in-scope
    providers and reach a usable conversation path.
  - Verify: existing BYOK e2e coverage plus any needed milestone-specific doc
    evidence.
  - Files: `tests/e2e/byok-onboarding.spec.ts`,
    `docs/operations/provider-acceptance.md`,
    `docs/product/demo-script.md`

## Phase 5: Delivery Closeout

- [x] Task A09: Capture milestone-facing delivery evidence
  - Acceptance: The repo clearly states what `Phase A` proves, what remains
    deferred, and what demo evidence exists today.
  - Verify: review the milestone log, demo script references, and any updated
    checklist/status docs.
  - Files: `ai/logs/*.md`, `docs/product/demo-script.md`,
    `docs/operations/*.md`

- [x] Task A10: Track the remaining non-code deliverables explicitly
  - Acceptance: Demo video, full four-provider release work, load testing, and
    final sign-off are listed as remaining items rather than left implicit.
  - Verify: review milestone docs and status notes.
  - Files: `ai/logs/*.md`, `docs/operations/release-checklist.md`,
    `docs/operations/load-test-results.md`

## Exit Condition For Starting Code

- [x] Task A01 is reviewed and accepted.
- [x] The next implementation turn starts at Task A03, not at a new provider.
- [x] Any change to the milestone scope is recorded before code is written.
