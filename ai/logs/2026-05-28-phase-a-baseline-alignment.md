# Phase A Baseline Alignment

## Scope

- Create a milestone-specific documentation set for `Phase A: Hermes +
  OpenClaw Baseline`.
- Separate the current minimum-delivery path from the full four-provider
  Release 1 target without touching business code.
- Leave a traceable record of every new planning artifact added in this turn.

## Skills Used

- `using-agent-skills`
- `spec-driven-development`
- `planning-and-task-breakdown`
- `documentation-and-adrs`

## What Landed

- Added
  [ai/specs/2026-05-28-phase-a-hermes-openclaw-baseline.md](../specs/2026-05-28-phase-a-hermes-openclaw-baseline.md)
  to define the current milestone, success criteria, and deferred scope.
- Added
  [ai/plans/phase-a-hermes-openclaw-baseline-plan.md](../plans/phase-a-hermes-openclaw-baseline-plan.md)
  to define dependency order, architecture decisions, checkpoints, and risks.
- Added
  [ai/tasks/phase-a-hermes-openclaw-baseline-tasks.md](../tasks/phase-a-hermes-openclaw-baseline-tasks.md)
  to define the next coding sequence from runtime wiring through acceptance and
  delivery closeout.
- Updated [ai/specs/README.md](../specs/README.md) and
  [ai/tasks/README.md](../tasks/README.md) so the new milestone documents are
  discoverable from the existing AI collaboration entrypoints.
- Added this log file to document what was created and to make the scope
  alignment reviewable.

## What Did Not Change

- No files under `apps/`, `packages/`, `db/`, or `tests/` were edited in this
  turn.
- The root [SPEC.md](../../SPEC.md) was not rewritten.
- No provider runtime code, adapter code, or test logic was modified.

## Why This Matters

- The repo previously mixed two incompatible statements:
  - the minimum original requirement is close to satisfied with `Hermes` and
    `OpenClaw`
  - the full Release 1 cut is still incomplete because four real providers and
    staging/load evidence are unfinished
- `Phase A` gives the next implementation turns one unambiguous target:
  first wire the real runtime path for `Hermes` and `OpenClaw`, then close the
  baseline acceptance loop, then capture delivery evidence.

## Verification

- Reviewed the active scope and acceptance docs:
  - [docs/product/original-requirements.md](../../docs/product/original-requirements.md)
  - [SPEC.md](../../SPEC.md)
  - [docs/operations/release-checklist.md](../../docs/operations/release-checklist.md)
  - [docs/operations/provider-acceptance.md](../../docs/operations/provider-acceptance.md)
- Reviewed the current runtime gaps:
  - [apps/api/src/modules/messages/message-dispatch.service.ts](../../apps/api/src/modules/messages/message-dispatch.service.ts)
  - [apps/worker/src/activities/direct-agent.activity.ts](../../apps/worker/src/activities/direct-agent.activity.ts)
  - [apps/worker/src/activities/dispatch-agent.activity.ts](../../apps/worker/src/activities/dispatch-agent.activity.ts)
- Confirmed that this turn is documentation-only by checking the working tree
  before applying changes.

## Residual Risk

- The repository still contains a stricter full Release 1 spec and checklist.
  That is intentional for now; the remaining risk is terminology drift between
  milestone docs and root release docs, not missing links.
- No runtime behavior changed yet; the mock-only direct/group execution gap
  remains until Task `A03` onward is implemented.
