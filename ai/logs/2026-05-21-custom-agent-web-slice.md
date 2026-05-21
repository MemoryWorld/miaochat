# 2026-05-21 Custom Agent Web Slice

## Scope

- Completed `Task 25`

## Changes

- Added a dedicated `/agents` workspace page so users can create light custom agents from the web client instead of relying on API-only flows.
- Implemented `AgentForm` with prompt-first fields for name, provider, capability tags, optional avatar URL, and system prompt, then wired it to `POST /custom-agents`.
- Implemented `AgentList` so saved custom agents render as reusable cards with provider and capability-tag summaries.
- Added `NewConversationDialog` to the chat sidebar and lazily load custom agents only when the user opens the custom conversation flow, which avoids disturbing the existing mock and SSE slices.
- Reused the existing conversation creation endpoint from the chat experience so selecting a saved custom agent produces a direct conversation without introducing a parallel frontend contract.
- Added page-level coverage for creating a custom agent and end-to-end UI coverage for selecting that agent in the conversation creation flow.

## Verification

- `pnpm --filter web test` passed.
- `pnpm test:e2e` passed.

## Notes

- The new conversation flow is intentionally limited to direct custom-agent sessions; group custom-agent composition remains a later slice.
- The seeded `Start mock conversation` action stays in place as a fast smoke path for the existing mock worker loop.
