# Spec Snapshot: Phase B Original Deliverable Closeout

## Status

Drafted on `2026-05-28` after `Phase A: Hermes + OpenClaw Baseline` landed.

This snapshot narrows the next delivery slice to the original course
deliverables instead of the full four-provider Release 1 gate.

## Assumptions I'm Making

1. The current milestone is judged by the floor in
   [docs/product/original-requirements.md](../../docs/product/original-requirements.md):
   runnable demo, technical/product docs, AI collaboration records, and a
   demo-video package that a human can record.
2. `Hermes` and `OpenClaw` remain the only in-scope real runtime providers for
   this milestone.
3. `Codex`, `Claude Code`, and `morph-labs/hermes-agent-fork` stay deferred and
   visible rather than implicitly dropped.
4. The local demo path is more valuable than a staging-first path because it is
   reproducible by reviewers and less dependent on missing SaaS secrets.
5. Mock adapters remain valid for tests, but the product-facing web path should
   stop narrating mock as the primary user journey.

## Objective

Define one practical closeout milestone:

> Miaochat has a repeatable local Phase A demo path, aligned operator docs, and
> a product UI that points users toward real `Hermes` / `OpenClaw` sessions
> instead of the historical mock-first path.

## Commands

Primary commands for this milestone:

```bash
pnpm demo:check:phase-a
pnpm demo:seed:phase-a
pnpm exec vitest run tests/demo-phase-a-check.spec.ts tests/demo-phase-a-seed.spec.ts
pnpm exec vitest run apps/web/src/features/chat/chat-experience.spec.tsx
pnpm --filter web build
pnpm --filter api build
pnpm --filter worker build
```

Not required for this milestone:

```bash
pnpm test:e2e:byok:staging
pnpm test:e2e:staging
k6 run tests/load/session-list.js
k6 run tests/load/send-message.js
k6 run tests/load/group-orchestration.js
k6 run tests/load/stream-stability.js
```

## Success Criteria

Phase B is complete when the repository proves all of the following:

1. A local operator can run `pnpm demo:check:phase-a` and understand whether
   the machine is ready for seed-only or full demo recording.
2. A local operator can run `pnpm demo:seed:phase-a` and receive:
   - one fixed demo user
   - one fixed demo workspace
   - one direct conversation
   - one mixed-provider group conversation
   - one artifact backup conversation
   - optional BYOK bindings for `Hermes` and `OpenClaw`
3. The web shell no longer tells users to start with the mock conversation path.
4. The repository contains explicit demo operator docs:
   - runbook
   - video checklist
   - architecture brief for explanation / defense
5. Deferred scope remains explicit:
   - `Codex`
   - `Claude Code`
   - `morph-labs/hermes-agent-fork`
   - full staging acceptance
   - full k6 evidence
   - manual demo video capture

## Deferred Scope After Phase B

- Human-recorded `3` minute demo video
- `Codex` runtime completion
- `Claude Code` runtime completion
- `morph-labs/hermes-agent-fork` transport evaluation
- Four-provider staging acceptance
- Full Release 1 load-test evidence
- Final release sign-off
