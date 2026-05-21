# 2026-05-21 Pinned Context Slice

## Scope

- Completed `Task 19`

## Changes

- Added a shared domain `assemblePinnedContext` helper so pinned messages are reduced into a stable replay payload before provider execution.
- Added an API `PinMessageService` that reloads pinned conversation history from persistence and injects that context into the Temporal-owned `singleAgentWorkflow`.
- Extended the shared agent execution request contract with optional pinned context and updated the mock direct adapter to deterministically replay pinned notes in both final content and streamed output.
- Added web pin controls so users can mark a message as pinned from the chat thread and immediately see the updated local pinned state without a full refresh.
- Hardened the web message reload path by merging server snapshots with in-flight local messages, which avoids losing the first prompt during the initial conversation-load race.
- Added integration and browser-flow coverage for pinning a message and verifying that the next assistant response includes the replayed pinned note.

## Verification

- `pnpm --filter @agenthub/domain test` passed.
- `pnpm --filter @agenthub/agent-adapters test` passed.
- `pnpm test:integration` passed.
- `pnpm test:e2e` passed.
- `pnpm lint` passed.
- `pnpm test` passed.
- `pnpm build` passed.

## Notes

- `Task 20` is now the next dependency-critical slice: group-conversation membership and explicit `@agent` targeting.
