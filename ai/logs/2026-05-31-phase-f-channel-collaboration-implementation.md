# Log: Phase F Channel Collaboration Implementation

## Date

2026-05-31

## Skills Used

- `编程技能包`
- `using-agent-skills`
- `git-workflow-and-versioning`
- `incremental-implementation`
- `test-driven-development`
- `api-and-interface-design`
- `frontend-ui-engineering`
- `security-and-hardening`

## Scope Completed

- Added first-class human channel membership persistence.
- Added unified channel member API for listing, inviting, permission updates, and removal.
- Connected workspace invitation acceptance to pending channel memberships.
- Replaced message read/send ownership checks with channel access checks.
- Added human author identity and human mention storage to messages.
- Ensured AI dispatch follows current channel AI membership.
- Allowed human-only channel messages to persist without forcing AI execution.
- Rebuilt the channel right panel as `成员与权限`.
- Added invite UI for existing workspace users and external email.
- Added member-aware mention chips for humans and AI 同事.
- Added message author/time/date readability, search, pinned drawer, copy, reply entry, reactions, presence/read markers, and safe AI action shortcuts.
- Added durable channel read state, unread counts, and per-channel notification preference.
- Added message thread replies with a thread drawer and main-timeline reply summaries.
- Added persisted message reactions with current-user reaction state.
- Added composer attachment metadata flow and channel-file refresh.

## New Files

- `apps/api/src/modules/channels/channel-members.repository.ts`
- `apps/api/src/modules/channels/channel-members.service.ts`
- `apps/api/src/modules/channels/channels.controller.ts`
- `apps/api/src/modules/channels/channels.module.ts`
- `apps/api/test/channel-members.service.spec.ts`
- `apps/api/test/channel-collaboration.e2e-spec.ts`
- `apps/web/src/features/chat/member-mention-input.tsx`
- `db/migrations/0024_phase_f_channel_members.sql`
- `db/migrations/0025_phase_f_channel_chat_capabilities.sql`
- `docs/architecture/phase-f-channel-access-model.md`
- `docs/operations/phase-f-channel-collaboration-runbook.md`

## Verification

- `pnpm --filter api build`
- `pnpm --filter web build`
- `pnpm db:migrate`
- `pnpm exec vitest run packages/contracts/test/schemas.spec.ts`
- `pnpm --filter api exec vitest run --config vitest.config.ts test/channel-members.service.spec.ts`
- `pnpm --filter api exec vitest run --config vitest.config.ts test/channel-collaboration.e2e-spec.ts`
- `pnpm exec vitest run apps/web/src/features/chat/chat-composer.spec.tsx apps/web/src/features/channels/channel-shell.spec.tsx`

## Known Environment Limitations

- Full API test suite requires local PostgreSQL/Redis test services. A focused Phase F integration test was run after starting local containers and applying migrations.
- Presence typing markers are lightweight in-memory collaboration signals and reset on service restart.
- Browser attachment support requests an upload target, uploads bytes to object storage, then persists artifact metadata so the message card and channel file page stay in sync.
