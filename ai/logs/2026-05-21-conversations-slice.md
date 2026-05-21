# 2026-05-21 Conversations Slice

## Scope

- Completed `Task 16`

## Changes

- Reused the API `DatabaseModule` to add transaction-capable conversation and message services backed by the existing PostgreSQL schema.
- Implemented `/conversations` create and list endpoints with workspace scoping, participant resolution from `custom_agents`, and generated fallback titles.
- Implemented `/messages` create and history endpoints plus `/messages/:messageId/pin` for persisted pinned-context updates.
- Updated conversation `updated_at` timestamps on message writes and synchronized `conversations.pinned_message_ids` with message pin operations.
- Added API e2e coverage for create/list/history/pin flows and root integration coverage that proves the pinned message IDs are persisted on the conversation record.

## Verification

- `pnpm --filter api test` passed.
- `pnpm --filter api build` passed.
- `pnpm test:integration` passed.
- `pnpm lint` passed.
- `pnpm build` passed.
- `pnpm test` passed.

## Notes

- The current message create path intentionally ignores `mentionedAgentIds`; that field remains reserved for the group-orchestration work in later tasks.
- SSE and browser live updates are still not wired; that is the next dependency-critical slice in `Task 17`.
