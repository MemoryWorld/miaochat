# Plan: Phase B Original Deliverable Closeout

## Plan Status

Implements the snapshot in
[ai/specs/2026-05-28-phase-b-original-deliverable-closeout.md](../specs/2026-05-28-phase-b-original-deliverable-closeout.md).

This is a closeout milestone for the original course deliverables, not a
rename of the full Release 1 target.

## Planning Constraints

- Keep `Hermes` and `OpenClaw` as the only runtime providers in scope.
- Do not start new provider implementation work.
- Prefer local repeatability over staging dependency.
- Keep mock available for tests, but remove it from the product-facing primary
  story.
- Record every new operator artifact in `ai/logs`.

## Architecture Decisions

### 1. Add A Demo Operator Pack Instead Of Manual Tribal Knowledge

The repository needs one reproducible operator path:
check readiness, seed deterministic demo data, start the apps, then log in and
record.

### 2. Fix Product Copy Before Recording The Demo

The current chat UI still advertises the mock direct path. That would create a
mismatch between the recorded product story and the runtime that Phase A
actually proved.

### 3. Treat Documentation As Part Of The Deliverable

The original requirement explicitly scores product explanation, technical
understanding, and AI collaboration records. The runbook, architecture brief,
and video checklist are first-class implementation outputs.

## Implementation Order

1. Add deterministic demo check + seed support.
2. Repoint the chat entry flow from mock-first to real-provider-first.
3. Publish the operator docs and architecture brief.
4. Update milestone/readme/checklist surfaces so the repository says one
   coherent thing about what is complete and what remains manual or deferred.

## Verification Checkpoints

### Checkpoint A: Demo Tooling

- `pnpm demo:check:phase-a` exists and reports readiness.
- `pnpm demo:seed:phase-a` exists and creates the fixed local demo data.

### Checkpoint B: Product Copy

- The chat workspace no longer renders `Start mock conversation`.
- Empty-state guidance points either to `/setup` or `New conversation`.

### Checkpoint C: Delivery Evidence

- Runbook, video checklist, and architecture brief exist.
- Release docs distinguish course closeout from full Release 1.

## Exit Condition

The milestone is ready for human handoff when the repo-side demo tooling,
product copy, and delivery docs are complete, and the only remaining item is
the manual video recording itself.
