# Spec Snapshot: Phase C Chinese AI Workforce Overhaul

## Status

Drafted on `2026-05-28` after reviewing the current `Miaochat` runtime baseline
and the public reference product surfaces.

This snapshot starts a full product-direction rewrite. It does not begin code
implementation yet. It defines the target product, the guardrails, and the
first execution wave.

## Assumptions I'm Making

1. The target is to match the interaction model, information architecture, and
   core product behavior of the reference product as closely as practical, but
   without copying its brand, trademarks, logos, or marketing copy verbatim.
2. The product should be Chinese-first:
   - all user-facing primary navigation
   - onboarding
   - empty states
   - task states
   - approval language
   - product docs for the new milestone
   should prioritize Simplified Chinese
3. This phase should not build a full bilingual i18n system. English can stay
   absent or secondary until the Chinese product loop is stable.
4. The existing runtime topology remains valuable and should be preserved as the
   substrate:
   `web -> api -> Temporal workflow -> worker -> provider adapter`
5. `Hermes` and `OpenClaw` remain the only in-scope runtime providers while the
   product shell is being rebuilt. `Codex`, `Claude Code`, and
   `morph-labs/hermes-agent-fork` stay deferred.
6. The current repository is functionally closer to a provider-runtime demo than
   an AI-native team workspace. The next milestone must close the product gap
   before adding more provider breadth.

## Objective

Transform `Miaochat` from a chat-centric multi-agent runtime demo into a
Chinese-first AI teammate workspace:

> humans and AI colleagues share the same channels, task surfaces, coding
> sessions, approvals, and visible audit trail, with providers hidden behind
> the runtime layer rather than presented as the product itself.

## Product Target

The new product target is defined by six pillars:

1. Unified channels
   - humans and AI teammates share one message plane
   - channel timeline becomes the primary work surface
2. Tasks
   - AI teammates can claim, update, and hand off work in a visible task flow
3. Coding sessions
   - coding work is represented as a reviewable execution session, not just a
     text reply
4. AI teammates
   - the primary user-facing entity is a teammate with a role, not a raw
     provider
5. Approvals
   - sensitive actions surface explicit human review cards
6. Integrations
   - chat, task, repo, deploy, email, and meeting adapters become visible
     product capabilities over time

## Commands

Planning and future implementation for this milestone will rely on:

```bash
pnpm --filter web test
pnpm --filter web build
pnpm --filter api build
pnpm --filter worker build
pnpm exec vitest run tests/integration/phase-a-runtime-baseline.spec.ts
pnpm exec vitest run apps/web/src/features/chat/chat-experience.spec.tsx
pnpm exec vitest run apps/web/src/features/setup/setup-flow.spec.tsx
```

When execution begins, expected additional commands will include targeted suites
for the new shell, channel timeline, task board, and approval surfaces.

## Project Structure

The redesign will primarily touch these areas:

```text
apps/web/src/app/                 Route entry points and shell composition
apps/web/src/components/          Shared UI primitives
apps/web/src/features/chat/       Current conversation shell; likely split and renamed
apps/web/src/features/agents/     Current agent management; will evolve toward teammate management
apps/web/src/features/setup/      Provider setup; will move out of the product center
apps/api/src/modules/             Conversation, message, credential, custom-agent APIs
apps/worker/src/                  Orchestration and provider execution substrate
packages/contracts/               Shared schema and DTO changes
packages/domain/                  Domain logic for new channel/task concepts
docs/product/                     Product-facing milestone docs
docs/architecture/                Runtime and architecture decisions
ai/specs/ ai/plans/ ai/tasks/     Active milestone control documents
```

## Code Style

The redesign should preserve the existing TypeScript + React style, but adopt
Chinese-first product copy and a more intentional workspace vocabulary.

Example direction:

```tsx
<section className="grid gap-3">
  <h2 className="text-2xl font-semibold text-slate-950">频道</h2>
  <p className="text-sm leading-7 text-slate-600">
    人类和 AI 同事共享同一条时间线，消息、任务、审批状态都在这里可见。
  </p>
</section>
```

Design constraints for the rebuild:

- do not expose raw provider names as the main UX object when a teammate or
  workspace concept is more appropriate
- prefer product language like `频道`, `任务`, `AI 同事`, `审批`, `文件`, `置顶`
- avoid English-first placeholders in the primary shell
- preserve established React patterns already used in the repo

## Testing Strategy

- Web component and route tests remain the fastest feedback loop for shell and
  copy changes.
- Integration tests continue to protect the real runtime baseline while the UI
  and data model evolve.
- New product surfaces should be added incrementally:
  - shell / navigation tests
  - channel timeline tests
  - task board tests
  - approval card tests
- The existing `Phase A` runtime slice must keep passing during the product
  rewrite until a later milestone explicitly supersedes it.

## Boundaries

- Always:
  - keep the existing `web/api/worker` runtime topology
  - keep `Hermes` / `OpenClaw` runtime support working while the shell evolves
  - record every milestone decision in `ai/logs`
  - write new user-facing primary copy in Chinese first
- Ask first:
  - database schema changes that replace `conversations` as the primary storage
    model
  - new third-party dependencies for UI, auth, or realtime infra
  - changing auth/session architecture
  - widening provider scope beyond `Hermes` / `OpenClaw`
- Never:
  - copy reference trademarks, logos, proprietary images, or marketing text
    verbatim
  - turn the product into a setup-first provider console again
  - introduce an English-first shell during the Chinese-first milestone

## Success Criteria

This program-level milestone is successful when all of the following are true:

1. The primary product story is an AI teammate workspace, not a provider
   binding demo.
2. The top-level web information architecture is Chinese-first and channel/task
   oriented.
3. Provider setup moves into a secondary system/settings role instead of being
   the first thing the product communicates.
4. AI teammates become first-class visible actors in the workspace shell.
5. Task flow, coding-session visibility, and approval surfaces become explicit
   product concepts.
6. The existing real runtime path remains functional under the new shell.
7. Deferred scope remains explicit instead of being silently dropped.

## Open Questions

1. Should `channels` be introduced as a new persistent entity immediately, or
   should the first shell map existing `conversations` into channel-like views
   for compatibility?
2. Should `tasks` be built directly in the core database schema next, or staged
   first as seeded/demo-level UI while the workflow semantics are refined?
3. Should the first coding-session surface reuse existing artifact cards and
   message timeline mechanics, or get its own dedicated session entity?
4. Which Chinese terminology should be frozen for the core nav:
   `消息 / 任务 / AI 同事 / 日历` or `频道 / 任务 / 同事 / 日程`?
5. How close should the visual system get to the reference product before the repo draws a hard
   line for originality?
