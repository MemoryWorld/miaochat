# Phase B Closeout Slice

## Scope

- Implement the repository-side work for
  [ai/tasks/phase-b-original-deliverable-closeout-tasks.md](../tasks/phase-b-original-deliverable-closeout-tasks.md).
- Keep the milestone bounded to the original course deliverable closeout.
- Avoid new provider integration work.

## Skills Used

- `using-agent-skills`
- `incremental-implementation`
- `test-driven-development`
- `documentation-and-adrs`
- `git-workflow-and-versioning`

## What Landed

- Added `scripts/demo/check-phase-a.ts` plus support logic to report local
  infra readiness and provider credential presence.
- Added `scripts/demo/seed-phase-a.ts` plus a deterministic seed library for a
  fixed demo user, workspace, conversations, artifacts, and optional
  `Hermes` / `OpenClaw` BYOK bindings.
- Repointed the main chat shell away from the mock-first CTA and empty-state
  copy.
- Added the Phase B milestone spec, plan, tasks, and closeout log.
- Added a runbook, video checklist, and architecture brief for the local demo
  handoff.
- Updated the demo script, release checklist, env template, and milestone
  indexes to reflect the new closeout path.

## Verification

- `pnpm exec vitest run tests/demo-phase-a-check.spec.ts tests/demo-phase-a-seed.spec.ts apps/web/src/features/chat/chat-experience.spec.tsx`
- `pnpm --filter web test`
- `pnpm --filter web build`
- `pnpm --filter api build`
- `pnpm --filter worker build`
- `pnpm exec eslint apps/web/src/features/chat/chat-experience.tsx apps/web/src/features/chat/chat-composer.tsx apps/web/src/features/chat/chat-experience.spec.tsx scripts/demo/phase-a-support.ts scripts/demo/seed-phase-a-lib.ts scripts/demo/check-phase-a.ts scripts/demo/seed-phase-a.ts tests/demo-phase-a-check.spec.ts tests/demo-phase-a-seed.spec.ts`
- `pnpm demo:check:phase-a`
- `pnpm demo:seed:phase-a`

## Runtime Note

- The local `demo:check` pass reported the machine as `Ready for seed`.
- The local `demo:seed` pass succeeded without bound provider secrets, so the
  seeded output correctly reported `manual_setup_required` for both `Hermes`
  and `OpenClaw`.

## Remaining Manual Work

- Record the actual `3` minute demo video using the new runbook and checklist.
- Full Release 1 still remains open for the deferred providers, staging suite,
  k6 evidence, and final sign-off.
