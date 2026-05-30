# Phase C Entry And Teammates Slice

## Scope

- Execute the first real implementation wave under the active built-in-agent
  coding workspace plan
- Complete `C02` through `C06`
- Keep the implementation on the compatibility path without introducing a new
  backend workflow entity yet

## Skills Used

- `using-agent-skills`
- `编程技能包`
- `incremental-implementation`
- `test-driven-development`
- `frontend-ui-engineering`
- `documentation-and-adrs`

## What Landed

- Added the built-in coding team registry:
  [apps/web/src/features/agents/built-in-coding-team.ts](../../apps/web/src/features/agents/built-in-coding-team.ts)
- Added the work-mode launcher and coding starter flow:
  [apps/web/src/features/workmodes/work-mode-launcher.tsx](../../apps/web/src/features/workmodes/work-mode-launcher.tsx)
- Reworked the chat shell so the primary post-login CTA is now `启动编码工作流`
  instead of only direct conversation creation:
  [apps/web/src/features/chat/chat-experience.tsx](../../apps/web/src/features/chat/chat-experience.tsx)
- Implemented a compatibility launch path that:
  - ensures the default built-in teammates exist
  - creates a group conversation
  - auto-sends a kickoff message that mentions the tech lead first
- Reframed `/agents` into an `AI 同事` directory with:
  - default built-in coding team cards
  - user-defined teammate creation
  - reduced provider emphasis in the normal UI
  Files:
  [apps/web/src/app/agents/page.tsx](../../apps/web/src/app/agents/page.tsx)
  [apps/web/src/features/agents/agent-form.tsx](../../apps/web/src/features/agents/agent-form.tsx)
  [apps/web/src/features/agents/agent-list.tsx](../../apps/web/src/features/agents/agent-list.tsx)
- Updated the direct conversation launcher copy so it reads as a secondary path:
  [apps/web/src/features/conversations/new-conversation-dialog.tsx](../../apps/web/src/features/conversations/new-conversation-dialog.tsx)

## Verification

- `pnpm --filter web exec vitest run src/features/chat/chat-experience.spec.tsx src/app/agents/page.spec.tsx`
- `pnpm --filter web exec eslint src/features/chat/chat-experience.tsx src/features/chat/chat-experience.spec.tsx src/features/conversations/new-conversation-dialog.tsx src/features/agents/agent-form.tsx src/features/agents/agent-list.tsx src/features/agents/built-in-coding-team.ts src/features/workmodes/work-mode-launcher.tsx src/app/agents/page.tsx src/app/agents/page.spec.tsx`
- `pnpm --filter web test`
- `pnpm --filter web build`

## Notes

- This slice does **not** complete the full Phase C milestone.
- The current kickoff path is still compatibility-based: the launcher creates a
  group conversation and sends a tech-lead-first message using existing APIs.
- Product language is now ahead of backend workflow semantics. The next slice
  should close that gap by introducing a real coding-workflow contract and plan
  approval flow.

## Next Recommended Work

Continue with:

1. `C07`: add a product-level coding workflow template API/contract
2. `C08`: make the tech lead plan a first-class visible state
3. `C09`: add approve / reject / revise actions for the plan gate
