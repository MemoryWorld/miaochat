# 2026-05-30 Channel detail member panel and title language

## Scope

- Continue the channel detail plan after the interrupted session.
- Keep `/channels/:channelId` under the left navigation "频道" section.
- Add a right-side member panel on the channel chat tab only.
- Change newly generated conversation titles from session/group wording to channel wording.

## Changes

- `apps/web/src/components/workspace-navigation.tsx`
  - Added a `channel` match mode so `/channels/overview` and `/channels/...` both activate "频道".
- `apps/web/src/features/channels/channel-shell.tsx`
  - Added a chat-only `ChannelMembersPanel`.
  - Shows `1 位用户 + N 位 AI 同事`.
  - Lists the current user and deduplicated AI coworkers from conversation participants.
  - Keeps the files tab as a single content column without the member panel.
- `apps/api/src/modules/conversations/conversations.service.ts`
  - Direct default title: `<AI 同事名称>频道`.
  - Group default title: `<前两位 AI 同事名称>协作频道`.
  - Empty participant fallback: `新频道`.

## Tests

- `pnpm --filter web test -- src/components/workspace-navigation.spec.tsx src/features/channels/channel-shell.spec.tsx`
  - Passed: 19 files, 39 tests.
- `pnpm --filter api test -- test/conversations.e2e-spec.ts`
  - First run failed because local Postgres/Redis were not reachable.
  - Started `postgres`, `pgbouncer`, and `redis` from `infra/docker/compose.dev.yml`.
  - Re-run passed: 16 files, 28 tests.
- `pnpm --filter web build`
  - Passed.
- `pnpm --filter api build`
  - Passed.

## Review Notes

- Existing historical titles are not migrated or rewritten; only newly generated titles change.
- The member panel intentionally only reads existing participants. It does not change runtime routing or launch/stop any AI coworker.
- No provider/internal runtime names were added to customer-facing UI.
