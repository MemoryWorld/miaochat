# Tasks: Phase B Original Deliverable Closeout

## Task Status

This task list is derived from
[ai/plans/phase-b-original-deliverable-closeout-plan.md](../plans/phase-b-original-deliverable-closeout-plan.md).

## Phase 1: Milestone Alignment

- [x] Task B01: Record the Phase B milestone spec, plan, and task file
  - Acceptance: Repo contains a dedicated closeout milestone for the original
    deliverables.
  - Verify: Open the milestone spec/plan/tasks and confirm the deferred scope
    still names `Codex`, `Claude Code`, `morph-labs/hermes-agent-fork`, and
    the manual demo video.

## Phase 2: Demo Operator Pack

- [x] Task B02: Add `pnpm demo:check:phase-a`
  - Acceptance: The command reports local infra readiness and whether provider
    demo credentials are present.
  - Verify: `pnpm exec vitest run tests/demo-phase-a-check.spec.ts`

- [x] Task B03: Add `pnpm demo:seed:phase-a`
  - Acceptance: The command creates or updates one fixed demo user, workspace,
    conversations, artifacts, and optional BYOK bindings.
  - Verify: `pnpm exec vitest run tests/demo-phase-a-seed.spec.ts`

- [x] Task B04: Add demo environment variable guidance
  - Acceptance: Root environment template documents the optional demo variables
    used by the seed/check scripts.
  - Verify: Review `.env.example` and the runbook.

## Phase 3: Product Copy Alignment

- [x] Task B05: Remove mock-first chat guidance from the main web shell
  - Acceptance: The sidebar and empty states point to `/setup` or
    `New conversation`, not the seeded mock direct path.
  - Verify: `pnpm exec vitest run apps/web/src/features/chat/chat-experience.spec.tsx`

- [x] Task B06: Update composer guidance to neutral real-provider language
  - Acceptance: The chat composer placeholder no longer mentions the mock
    builder.
  - Verify: Review `apps/web/src/features/chat/chat-composer.tsx`.

## Phase 4: Delivery Evidence

- [x] Task B07: Add the demo runbook, video checklist, and architecture brief
  - Acceptance: Repo contains explicit operator-facing demo docs and one
    architecture explainer for answer-defense.
  - Verify: Open the new docs under `docs/product` and `docs/architecture`.

- [x] Task B08: Update milestone-facing docs and indexes
  - Acceptance: `ai/specs/README.md`, `ai/tasks/README.md`,
    `docs/product/demo-script.md`, and
    `docs/operations/release-checklist.md` all align to the closeout milestone.
  - Verify: Review those files for consistent terminology.

## Phase 5: Manual Handoff

- [ ] Task B09: Record the 3-minute demo video
  - Acceptance: A human operator records and exports the final video using the
    runbook and checklist.
  - Verify: External artifact, not repo-automated.
