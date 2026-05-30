# Phase C Shell Slice

## Scope

- Execute the first coding wave for
  [ai/tasks/phase-c-chinese-ai-workforce-overhaul-tasks.md](../tasks/phase-c-chinese-ai-workforce-overhaul-tasks.md).
- Complete `C03` and `C04` only:
  - freeze Chinese-first vocabulary
  - rebuild the top-level shell into a workspace-first experience
- Avoid data-model or runtime changes in this slice.

## Skills Used

- `using-agent-skills`
- `编程技能包`
- `incremental-implementation`
- `frontend-ui-engineering`
- `test-driven-development`
- `documentation-and-adrs`
- `git-workflow-and-versioning`

## What Landed

- Added the Chinese vocabulary freeze doc:
  [docs/product/phase-c-chinese-vocabulary.md](../../docs/product/phase-c-chinese-vocabulary.md)
- Reworked the shared `AppShell` visual frame to feel like a workspace surface
  rather than a generic demo container.
- Reframed the homepage shell around:
  - `AI 协作工作台`
  - Chinese primary navigation
  - workspace context
  - channel-first entry framing
- Shifted first-layer user-facing copy to Chinese in:
  - auth/session panel
  - workspace switcher
  - channel timeline
  - composer
  - new conversation dialog
  - loading and empty states
- Removed the build-time dependency on `next/font/google` and switched the app
  to local font-family stacks so `web build` no longer depends on Google Fonts
  network access.

## Verification

- `pnpm exec vitest run apps/web/src/features/auth/auth-panel.spec.tsx apps/web/src/features/chat/chat-composer.spec.tsx apps/web/src/features/chat/chat-experience.spec.tsx`
- `pnpm --filter web test`
- `pnpm --filter web build`
- `pnpm --filter api build`
- `pnpm --filter worker build`
- `pnpm exec eslint apps/web/src/components/app-shell.tsx apps/web/src/app/home-page-client.tsx apps/web/src/features/workspaces/workspace-switcher.tsx apps/web/src/features/auth/auth-panel.tsx apps/web/src/features/chat/agent-mention-input.tsx apps/web/src/features/chat/chat-thread.tsx apps/web/src/features/chat/chat-composer.tsx apps/web/src/features/conversations/new-conversation-dialog.tsx apps/web/src/features/chat/chat-experience.tsx apps/web/src/features/auth/auth-panel.spec.tsx apps/web/src/features/chat/chat-composer.spec.tsx apps/web/src/features/chat/chat-experience.spec.tsx apps/web/src/app/layout.tsx apps/web/src/app/layout.spec.tsx`

## Remaining Work

- `C05`: demote `/setup` into a more clearly secondary settings flow
- `C06`: introduce a stronger channel-style left rail using compatibility data
- `C07`: turn the main timeline tabs into a real channel surface
- `C08`: make AI teammates feel first-class beyond labels and entry framing
