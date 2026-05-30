# Tasks: Phase F Channel Collaboration Chat Window

## Phase F0: Contract And Membership Foundation

- [ ] Task F00: Define unified channel member contracts
  - Acceptance:
    - Shared contracts expose one `ChannelMember` union for humans and AI 同事.
    - Contracts include role, permission, status, display name, avatar, and stable member id.
    - Contract names use customer-safe product language.
  - Verify:
    - Contract unit tests.
    - Typecheck.
  - Files:
    - `packages/contracts/src/**`
  - Scope: M

- [ ] Task F01: Define message author and mention contract
  - Acceptance:
    - Message response can identify human authors and AI authors.
    - `ownerUserId` remains the namespace owner.
    - Human mentions and AI mentions are both represented.
  - Verify:
    - Contract tests for user-authored, AI-authored, and mentioned messages.
    - Typecheck.
  - Files:
    - `packages/contracts/src/message.ts`
    - `packages/contracts/src/conversation.ts`
  - Scope: M

- [ ] Task F02: Document channel access semantics
  - Acceptance:
    - Read/comment/manage permissions are defined.
    - Owner/admin/member/guest/AI role behaviors are defined.
    - Non-member deny cases are explicit.
  - Verify:
    - Manual review against Phase F plan.
  - Files:
    - `docs/architecture/**`
    - `ai/specs/**`
  - Scope: S

## Phase F1: Real Human Coworkers In Channels

- [ ] Task F10: Add human channel membership persistence
  - Acceptance:
    - A first-class table stores human membership for a channel.
    - Existing owner conversations are backfilled as active human members.
    - Uniqueness prevents duplicate active membership per user/channel.
  - Verify:
    - Migration test.
    - Repository test.
  - Files:
    - `db/**`
    - `apps/api/src/modules/conversations/**`
  - Scope: M

- [ ] Task F11: Build channel member list API
  - Acceptance:
    - `GET /channels/:channelId/members` returns humans and AI 同事 in one list.
    - Current owner and existing AI 同事 appear correctly.
    - Pending human invitations can appear without read/send access.
  - Verify:
    - API integration tests.
  - Files:
    - `apps/api/src/modules/channels/**`
    - `apps/api/src/modules/conversations/**`
    - `packages/contracts/src/**`
  - Scope: M

- [ ] Task F12: Add existing-user channel invite API
  - Acceptance:
    - A workspace member can be added to a channel with read/comment permission.
    - Duplicate adds are idempotent or return a product-safe Chinese error.
    - Audit log records the action.
  - Verify:
    - API tests for success, duplicate, non-workspace user, and unauthorized inviter.
  - Files:
    - `apps/api/src/modules/channels/**`
    - `apps/api/src/modules/workspaces/**`
  - Scope: M

- [ ] Task F13: Add external-email channel invite bridge
  - Acceptance:
    - Unknown email creates a workspace invitation.
    - Channel pending membership is visible as pending.
    - User becomes active in channel only after accepting workspace invitation.
  - Verify:
    - API tests for pending invite and acceptance path.
  - Files:
    - `apps/api/src/modules/workspaces/**`
    - `apps/api/src/modules/channels/**`
  - Scope: L

- [ ] Task F14: Replace conversation ownership checks with channel access checks
  - Acceptance:
    - Owners can still read/send.
    - Invited channel members with comment permission can send.
    - Read-only channel members cannot send.
    - Non-members cannot read or send.
  - Verify:
    - API tests around `GET /messages` and `POST /messages/send`.
  - Files:
    - `apps/api/src/modules/messages/**`
    - `apps/api/src/modules/conversations/**`
    - `apps/api/src/modules/channels/**`
  - Scope: L

- [ ] Task F15: Add human author identity to messages
  - Acceptance:
    - New user-authored messages store the real `authorUserId`.
    - Message list returns author display data.
    - Existing messages degrade gracefully to the owner identity.
  - Verify:
    - Migration test.
    - API response tests.
  - Files:
    - `db/**`
    - `apps/api/src/modules/messages/**`
    - `packages/contracts/src/message.ts`
  - Scope: M

- [ ] Task F16: Ensure AI dispatch respects active channel membership
  - Acceptance:
    - Removed AI 同事 is not targeted.
    - Explicit mention to missing AI 同事 returns a Chinese error.
    - Human-only messages can persist without starting AI execution.
  - Verify:
    - API tests with active, removed, and no-AI channel states.
  - Files:
    - `apps/api/src/modules/messages/**`
    - `apps/api/src/modules/conversations/**`
    - `apps/worker/src/**`
  - Scope: M

## Phase F2: Member Panel And Invite UX

- [ ] Task F20: Replace channel member panel with unified members panel
  - Acceptance:
    - Panel shows human count, AI 同事 count, and total count.
    - Current user, real coworkers, pending users, and AI 同事 render in one panel.
    - Small screens can open the panel as a drawer.
  - Verify:
    - Component tests.
    - Browser manual check.
  - Files:
    - `apps/web/src/features/channels/**`
    - `apps/web/src/features/chat/**`
  - Scope: M

- [ ] Task F21: Add invite coworker UI
  - Acceptance:
    - User can search workspace members.
    - User can add one or more members to the current channel.
    - User sees Chinese success/error copy.
  - Verify:
    - Component tests.
    - Browser test with mocked API.
  - Files:
    - `apps/web/src/features/channels/**`
    - `apps/web/src/features/settings/**`
  - Scope: M

- [ ] Task F22: Add external email invite UI
  - Acceptance:
    - User can type an email in the same invite flow.
    - Pending invite appears in member panel.
    - Invalid email and duplicate invite show clear Chinese errors.
  - Verify:
    - Component tests.
  - Files:
    - `apps/web/src/features/channels/**`
  - Scope: M

- [ ] Task F23: Add member remove and permission menu
  - Acceptance:
    - Human member can be removed with confirmation.
    - Human member permission can be switched between read/comment.
    - AI 同事 can be removed with confirmation.
    - Last required owner/admin removal is blocked.
  - Verify:
    - Component tests.
    - API tests for deny cases.
  - Files:
    - `apps/web/src/features/channels/**`
    - `apps/api/src/modules/channels/**`
  - Scope: M

## Phase F3: Human And AI Mentions

- [ ] Task F30: Replace AI-only mention input with member-aware mention input
  - Acceptance:
    - Mention picker lists humans and AI 同事.
    - Selected mentions become chips.
    - Chinese display names are preserved.
  - Verify:
    - Component tests for Chinese names and duplicate display names.
  - Files:
    - `apps/web/src/features/chat/**`
    - `packages/contracts/src/**`
  - Scope: M

- [ ] Task F31: Store and validate human mentions
  - Acceptance:
    - `mentionedUserIds` is stored.
    - Mentioned humans must be active channel members.
    - Mentioned AI 同事 must be active channel members.
  - Verify:
    - API tests for valid and invalid mentions.
  - Files:
    - `apps/api/src/modules/messages/**`
    - `apps/api/src/modules/conversations/**`
  - Scope: M

- [ ] Task F32: Create mention inbox events
  - Acceptance:
    - Mentioned human receives an inbox item.
    - Mentioned user can route back to the channel message.
    - AI mentions continue to drive AI dispatch.
  - Verify:
    - API tests.
    - Web test for inbox route.
  - Files:
    - `apps/api/src/modules/workspace-shell/**`
    - `apps/api/src/modules/messages/**`
    - `apps/web/src/features/inbox/**`
  - Scope: M

## Phase F4: Message Readability And Actions

- [ ] Task F40: Add author presentation improvements
  - Acceptance:
    - Messages show author name, avatar/initial, timestamp, and date divider.
    - Consecutive messages from the same author can be visually grouped.
    - AI 同事 and human coworkers are visually distinct but not branded by backend.
  - Verify:
    - Component tests.
    - Browser manual check with multiple authors.
  - Files:
    - `apps/web/src/features/chat/**`
  - Scope: M

- [ ] Task F41: Add compact message action menu
  - Acceptance:
    - Pin and copy are available from a calmer action area.
    - Action menu is keyboard accessible.
    - Existing pin behavior still works.
  - Verify:
    - Component tests.
  - Files:
    - `apps/web/src/features/chat/**`
  - Scope: M

- [ ] Task F42: Add pinned-message drawer
  - Acceptance:
    - Channel header or right panel can open pinned messages.
    - Pinned messages show author and jump-to-message action.
  - Verify:
    - Component tests.
  - Files:
    - `apps/web/src/features/channels/**`
    - `apps/web/src/features/chat/**`
  - Scope: M

- [ ] Task F43: Add channel search entry point
  - Acceptance:
    - User can search channel messages.
    - Filters include author, pinned, date, and attachment placeholder.
    - Search result can jump to a message.
  - Verify:
    - API tests.
    - Component tests.
  - Files:
    - `apps/api/src/modules/messages/**`
    - `apps/web/src/features/channels/**`
  - Scope: L

## Phase F5: Realtime Collaboration Signals

- [ ] Task F50: Add typing indicators
  - Acceptance:
    - Composer emits typing started/stopped.
    - Channel thread renders human and AI typing states.
    - Typing state expires automatically.
  - Verify:
    - Stream/event tests.
    - Browser manual check.
  - Files:
    - `apps/api/src/modules/streams/**`
    - `apps/web/src/features/chat/**`
  - Scope: M

- [ ] Task F51: Add read receipts and unread counts
  - Acceptance:
    - Opening a channel can mark messages read.
    - Channel list shows unread count.
    - Message thread can show minimal seen state.
  - Verify:
    - API tests.
    - Component tests.
  - Files:
    - `db/**`
    - `apps/api/src/modules/channels/**`
    - `apps/web/src/features/channels/**`
  - Scope: L

- [ ] Task F52: Add per-channel notification preference placeholder
  - Acceptance:
    - User can choose all messages, mentions only, or muted.
    - Preference affects unread/mention display only until push/email exists.
  - Verify:
    - Component tests.
    - API tests for persistence.
  - Files:
    - `apps/api/src/modules/channels/**`
    - `apps/web/src/features/channels/**`
  - Scope: M

## Phase F6: Threads, Reactions, Files

- [ ] Task F60: Add reply/thread model and drawer
  - Acceptance:
    - User can reply to a message in a thread drawer.
    - Thread replies keep author identity.
    - Channel timeline shows thread summary count.
  - Verify:
    - API tests.
    - Component tests.
  - Files:
    - `db/**`
    - `apps/api/src/modules/messages/**`
    - `apps/web/src/features/chat/**`
  - Scope: L

- [ ] Task F61: Add reactions
  - Acceptance:
    - User can add/remove a small set of reactions.
    - Reaction count is grouped by emoji.
    - Duplicate reaction by same user is blocked.
  - Verify:
    - API tests.
    - Component tests.
  - Files:
    - `db/**`
    - `apps/api/src/modules/messages/**`
    - `apps/web/src/features/chat/**`
  - Scope: M

- [ ] Task F62: Add attachment upload in composer
  - Acceptance:
    - User can attach a file to a message.
    - File appears in message and channel file tab.
    - AI 同事 can only consume files explicitly included as context.
  - Verify:
    - API tests.
    - Browser test for upload and preview.
  - Files:
    - `apps/api/src/modules/artifacts/**`
    - `apps/api/src/modules/messages/**`
    - `apps/web/src/features/chat/**`
    - `apps/web/src/features/channels/**`
  - Scope: L

## Phase F7: AI Collaboration Actions

- [ ] Task F70: Add AI context actions from messages
  - Acceptance:
    - User can select message context and ask AI 同事 to summarize, plan, review, or create task.
    - Removed/disabled AI 同事 cannot be selected.
    - Result persists as channel message or artifact.
  - Verify:
    - API tests.
    - Browser test with one AI 同事.
  - Files:
    - `apps/api/src/modules/messages/**`
    - `apps/api/src/modules/coding-workflows/**`
    - `apps/web/src/features/chat/**`
    - `apps/web/src/features/channels/**`
  - Scope: L

- [ ] Task F71: Add slash-style action suggestions
  - Acceptance:
    - Typing `/` shows customer-safe actions such as `总结`, `创建任务`, `生成计划`, `邀请同事`.
    - Suggestions do not expose runtime or provider names.
  - Verify:
    - Component tests.
  - Files:
    - `apps/web/src/features/chat/**`
  - Scope: M

## Phase F8: Security, Tests, And Acceptance

- [ ] Task F80: Add multi-user channel access acceptance tests
  - Acceptance:
    - Owner invites real coworker.
    - Coworker can read and comment.
    - Read-only coworker cannot send.
    - Removed coworker cannot access.
  - Verify:
    - API integration tests.
    - E2E test with two users.
  - Files:
    - `tests/**`
    - `apps/api/src/**`
    - `apps/web/src/**`
  - Scope: L

- [ ] Task F81: Add AI membership dispatch acceptance tests
  - Acceptance:
    - Active AI 同事 receives targeted dispatch.
    - Removed AI 同事 does not receive dispatch.
    - Human-only channel message persists without forcing AI execution.
  - Verify:
    - API tests.
    - Worker route tests.
  - Files:
    - `apps/api/src/modules/messages/**`
    - `apps/worker/src/**`
    - `tests/**`
  - Scope: M

- [ ] Task F82: Update demo runbook for real channel collaboration
  - Acceptance:
    - Runbook shows adding a human coworker and AI 同事 into the same channel.
    - Runbook includes expected screenshots/states.
    - Runbook includes failure recovery notes.
  - Verify:
    - Manual run-through.
  - Files:
    - `docs/operations/**`
    - `README.md`
  - Scope: S
