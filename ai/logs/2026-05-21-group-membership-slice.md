# 2026-05-21 Group Membership Slice

## Scope

- Completed `Task 20`

## Changes

- Added `messages.mentioned_agent_ids` through the `0002_group-conversation.sql` migration so explicit group targets can be persisted with user-authored messages.
- Tightened the conversation contract so direct conversations require exactly one agent while group conversations require at least two agents.
- Added a `GroupMembersService` in the API layer to reload conversation members and reject explicit targets that do not belong to the current group conversation.
- Extended the message persistence path so `mentionedAgentIds` survive create, list, pin-context reload, and assistant-message creation without breaking the existing direct-chat slice.
- Added a browser `AgentMentionInput` plus composer wiring so multi-agent conversations can emit an explicit `@agent-name` target and send the matching `mentionedAgentIds` to the API.

## Verification

- `pnpm --filter web test` passed.
- `pnpm test:integration` passed.
- `pnpm test` passed.
- `pnpm lint` passed.
- `pnpm build` passed.

## Notes

- `Task 21` is now the next dependency-critical slice: the worker still rejects `mode=group` dispatch, so the new target metadata is persisted and validated now but not yet executed by an orchestrator.
- Running `pnpm db:migrate` against an already-initialized local database still replays older non-idempotent migrations; for this slice I applied `0002` directly to the active local database before verification.
