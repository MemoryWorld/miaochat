# Phase C Overhaul Planning

## Scope

- Start the repository planning track for a reference-product-inspired but Chinese-first
  product overhaul.
- Do not implement runtime or UI code in this slice.
- Replace the previous active milestone framing with a new top-level planning
  milestone.

## Skills Used

- `using-agent-skills`
- `编程技能包`
- `spec-driven-development`
- `planning-and-task-breakdown`
- `documentation-and-adrs`

## What Landed

- Added a new active spec snapshot:
  [ai/specs/2026-05-28-phase-c-chinese-ai-workforce-overhaul.md](../specs/2026-05-28-phase-c-chinese-ai-workforce-overhaul.md)
- Added a new active implementation plan:
  [ai/plans/phase-c-chinese-ai-workforce-overhaul-plan.md](../plans/phase-c-chinese-ai-workforce-overhaul-plan.md)
- Added a new first-wave task list:
  [ai/tasks/phase-c-chinese-ai-workforce-overhaul-tasks.md](../tasks/phase-c-chinese-ai-workforce-overhaul-tasks.md)
- Updated `ai/specs/README.md` and `ai/tasks/README.md` to point future work at
  the new milestone.

## Key Decisions

- The next major gap is product shape, not provider count.
- The rebuild should be Chinese-first rather than introducing bilingual i18n
  immediately.
- The existing `web -> api -> worker -> provider adapter` runtime remains the
  substrate; it is not being replaced in this planning slice.
- The product should emulate the reference product's interaction model and entity hierarchy
  while avoiding verbatim asset or trademark copying.
- The first coding wave should start with shell, navigation, vocabulary, and
  channel framing before schema-heavy task or integration work.

## Verification

- Reviewed public reference product and scenario pages on `2026-05-28`.
- Reviewed current repository product and runtime docs before drafting the new
  milestone.
- Open the new spec/plan/tasks/log files and confirm they define one coherent
  active direction.

## What Did Not Change

- No files under `apps/`, `packages/`, `db/`, or `tests/` were modified for
  product behavior in this slice.
- No builds or tests were run because this slice is documentation and planning
  only.
