# Plan: Phase F Channel Collaboration Chat Window

## Status

Planning only. No product code is implemented in this step.

## Objective

Phase F turns the current channel chat page into a real collaboration room where:

- users can work with AI 同事 in the same channel;
- users can invite real human coworkers into the channel;
- messages, members, permissions, mentions, files, and AI execution all use one consistent channel model;
- the customer-facing product never exposes internal runtime, provider, or engine names.

This phase is separate from Phase E. Phase E focuses on AI 同事 productization and model connection readiness. Phase F focuses on the chat window and channel collaboration model.

## Research References

The research sample uses high-recognition open-source team chat and room-based collaboration systems. We are referencing interaction patterns and capability boundaries, not copying code, branding, or visual assets.

- Mattermost: channels are positioned as the shared source of truth for conversations, processes, integrations, slash commands, bots, Markdown, syntax highlighting, and developer workflows.
  Source: https://mattermost.com/channels/
- Mattermost integrations: webhooks and slash commands are used to post into channels and trigger actions without leaving the chat surface.
  Source: https://docs.mattermost.com/integrations-guide/integrations-guide-index.html
- Mattermost slash commands: built-in commands include examples such as inviting teammates and starting calls from a channel.
  Source: https://docs.mattermost.com/integrations-guide/slash-commands.html
- Rocket.Chat channels: public/private channels, invited membership, and permission-controlled posting/reactions are central to room collaboration.
  Source: https://docs.rocket.chat/docs/channels
- Rocket.Chat room actions: threads, discussions, message search, mentions, pinned messages, and notification preferences are room-level capabilities.
  Source: https://docs.rocket.chat/docs/room-actions
- Zulip topics: multiple conversations can happen inside one channel by using topics, which keeps asynchronous work organized.
  Source: https://docs.zulip.com/help/introduction-to-topics
- Matrix client-server API: room membership, invite/join/leave/kick, read receipts, typing notifications, threads, presence, and media APIs provide a mature room protocol model.
  Source: https://spec.matrix.org/latest/client-server-api/
- Element Web: an open-source Matrix web/desktop client that validates the room-based collaboration direction.
  Source: https://github.com/element-hq/element-web

## Current Miaochat Baseline

Already present:

- `apps/web/src/features/channels/channel-shell.tsx` renders a two-column channel chat page with a right-side member panel.
- `ChatThread` renders persisted messages, live assistant streaming text, status events, deployments, empty state, and pin action.
- `ChatComposer` can send a user message to `/messages/send` and can target selected AI 同事 through `mentionedAgentIds`.
- `ChannelMembersPanel` shows the current user and AI 同事, and provides `新建同事`.
- `POST /conversations/:conversationId/teammates` can add a new AI 同事 into a conversation.
- `POST /conversations/:conversationId/shares` exists and can share a conversation with existing workspace users.
- workspace membership and workspace invitations already exist in the backend domain.

Main gaps:

- The right-side channel member panel only shows `你 + AI 同事`; it does not show real human coworkers who were shared into the channel.
- `conversation_shares` is not enough as the long-term membership model because it behaves like sharing permission, not a first-class channel roster.
- `MessagesService` currently asserts conversation ownership before read/send, so a shared human coworker cannot become a true channel participant without an access model change.
- `messages.ownerUserId` is currently used as the owner namespace; it is not enough to identify the human author once multiple human users can send messages.
- `Message` only has `mentionedAgentIds`; it cannot mention human coworkers.
- `ConversationAgentMember` only models AI participants; there is no unified channel member contract.
- `AgentMentionInput.buildMentionLabel` strips non-Latin characters, which is wrong for Chinese display names.
- The chat thread lacks message timestamps, grouped messages, reply threads, reactions, read receipts, typing indicators, unread counts, search, and pinned-message drawer.
- The composer lacks attachment upload, slash/action commands, draft persistence, keyboard behavior, and a member-aware mention picker.

## Product Principles

- Customer language is always `频道`, `AI 同事`, `同事`, `成员`, `模型连接`, `工作区`.
- Internal provider/runtime names must not appear in the chat UI, setup UI, user-facing errors, help text, seeded content, or demo copy.
- AI 同事 and real coworkers are both channel members, but they have different capabilities.
- Adding or removing a member must change runtime behavior. If an AI 同事 is removed from a channel, the backend must not dispatch that channel message to that AI 同事.
- Human invitation and AI 同事 creation should live in the same channel member area, but the actions should be visually distinct.
- Keep the channel detail layout simple: main chat on the left, member/context panel on the right; collapse the member panel behind a button on small screens.

## Target User Stories

- As a workspace user, I can open a channel and see exactly which real coworkers and AI 同事 are inside it.
- As a workspace user, I can invite an existing real coworker into the current channel.
- As a workspace user, I can invite an email that is not yet in the workspace; the system sends a workspace invitation and marks the channel join as pending.
- As a channel member with comment permission, I can send messages in the channel and see my name on my own messages.
- As a channel member, I can mention a real coworker or AI 同事 in Chinese without broken `@` labels.
- As a channel member, I can see typing indicators, unread state, pinned messages, and useful message actions.
- As a channel member, I can ask an AI 同事 to summarize, plan, review, or continue from selected channel context.
- As a workspace admin or channel owner, I can remove a human coworker or AI 同事 from a channel and the removal takes effect immediately.

## Architecture Decision

Use a first-class unified channel member model instead of stretching `conversation_shares` into a permanent room roster.

Rationale:

- A real channel member needs display identity, role, permission, joined state, pending invite state, removal, audit, and future presence/read receipt state.
- `conversation_shares` can remain as a compatibility bridge, but it should not be the main mental model for users.
- AI 同事 membership already exists through `conversation_agents` and `teammate_channel_memberships`; human channel membership should mirror that clarity.
- The API should return one member list containing both human and AI entries, so the frontend does not infer membership from multiple unrelated endpoints.

## Proposed Contracts

### ChannelMember

```ts
type ChannelMember =
  | {
      kind: "human";
      memberId: `human:${string}`;
      userId: string;
      displayName: string;
      avatarUrl: string | null;
      role: "owner" | "admin" | "member" | "guest";
      permission: "read" | "comment" | "manage";
      status: "active" | "pending" | "disabled";
      joinedAt: string | null;
      lastActiveAt: string | null;
    }
  | {
      kind: "ai";
      memberId: `ai:${string}`;
      teammateId: string;
      displayName: string;
      avatarUrl: string | null;
      role: "ai_teammate";
      permission: "comment";
      status: "available" | "running" | "disabled";
      joinedAt: string | null;
      lastActiveAt: string | null;
    };
```

### Message Author

Add author identity without breaking the existing workspace owner namespace:

- keep `ownerUserId` as the workspace/conversation owner namespace;
- add `authorUserId` for human-authored messages;
- keep `sourceAgentId` for AI-authored messages;
- return an `author` summary in API responses so the UI does not need to resolve labels by guessing.

### Mentions

Extend the message shape:

- `mentionedAgentIds`: AI 同事 mentions;
- `mentionedUserIds`: human coworker mentions;
- `mentionedAll`: optional later flag for `@所有人`;
- mention labels use display names directly for Chinese and only generate ASCII handles as a fallback alias.

### Channel Member APIs

New customer-facing channel APIs:

- `GET /channels/:channelId/members?workspaceId=...`
- `POST /channels/:channelId/members/humans`
- `POST /channels/:channelId/members/ai`
- `PATCH /channels/:channelId/members/:memberId`
- `DELETE /channels/:channelId/members/:memberId`

Suggested request shape for adding humans:

```ts
type AddHumanChannelMembersInput = {
  workspaceId: string;
  userIds?: string[];
  emails?: string[];
  permission: "read" | "comment";
};
```

Suggested request shape for adding AI 同事:

```ts
type AddAiChannelMemberInput = {
  workspaceId: string;
  teammateId?: string;
  templateId?: string;
  profile?: {
    name: string;
    mission: string;
    instructions: string;
  };
};
```

## Access Model

Read access:

- workspace owner can read;
- active human channel member with `read`, `comment`, or `manage` can read;
- workspace admin can read when workspace policy allows admin access.

Send access:

- workspace owner can send;
- active human channel member with `comment` or `manage` can send.

Member management:

- workspace owner can add/remove any channel member;
- workspace admin can add/remove based on workspace permission;
- channel member with `manage` can invite/remove non-owner members;
- the last human owner/admin cannot remove themselves without transferring ownership.

AI dispatch:

- a channel message can dispatch only to AI 同事 that are active channel members;
- direct mention dispatch uses the resolved member list, not stale `conversation_agents`;
- if no AI 同事 is active and the user sends a normal human message, it should persist without starting AI execution;
- if the user explicitly mentions a missing/removed AI 同事, return a product-safe Chinese error.

## Data Model Plan

Preferred schema direction:

- introduce `channel_user_memberships`;
- keep `conversation_agents` or `teammate_channel_memberships` for AI membership in this phase, but expose them through the unified `ChannelMember` contract;
- migrate or mirror `conversation_shares` into `channel_user_memberships`;
- keep `conversation_shares` temporarily for backwards compatibility and access-review history;
- add `author_user_id` to `messages`;
- add `mentioned_user_ids` to `messages`;
- add optional tables later for reactions, read receipts, typing state, and thread replies.

Suggested `channel_user_memberships` fields:

- `id`
- `channel_id`
- `workspace_id`
- `workspace_owner_user_id`
- `user_id`
- `role`
- `permission`
- `status`
- `invited_by_user_id`
- `joined_at`
- `removed_at`
- `created_at`
- `updated_at`

Important uniqueness rule:

- one active row per `(workspace_owner_user_id, workspace_id, channel_id, user_id)`.

## UI Plan

### Channel Member Panel

Replace the current simple panel with a real `成员与权限` panel:

- header shows total members, human count, and AI 同事 count;
- primary action: `邀请同事`;
- secondary action: `新建 AI 同事`;
- existing workspace users open a picker;
- unknown emails trigger workspace invitation flow;
- pending invited users appear as `待加入`;
- human cards show display name, permission, status, and remove/menu action;
- AI cards show display name, availability/running state, and remove/menu action;
- empty AI state says `还没有 AI 同事参与这个频道`;
- empty human coworker state says `还没有邀请其他同事`;
- small screens collapse this panel into a drawer.

### Chat Composer

Upgrade the composer in this order:

- member-aware mention picker for real coworkers and AI 同事;
- Chinese-safe mention rendering;
- selected mention chips above the text area;
- `Enter` sends and `Shift+Enter` inserts newline;
- disabled send reason when the user lacks comment permission;
- attachment button placeholder after core membership works;
- slash/action command suggestions after core membership works.

### Chat Thread

Upgrade message readability:

- show author avatar/initial, author name, timestamp, and role-safe label;
- group consecutive messages from the same author;
- add date dividers;
- keep pin action but move it into a calmer hover/action menu;
- add reply/thread entry point after message authorship is fixed;
- add reactions after reply/thread shape is fixed;
- show product-safe streaming state only when relevant;
- keep failure recovery cards but visually separate them from user chat messages.

### Channel Header

Add lightweight channel context:

- channel name;
- member count;
- active AI 同事 count;
- unread/mention count when available;
- quick access to pinned messages and files.

## Feature Backlog From Open-Source Chat Patterns

Must implement for Miaochat MVP:

- unified channel member roster;
- invite existing workspace users into channel;
- invite external email into workspace then channel;
- channel read/send permissions;
- multi-human message authorship;
- AI 同事 dispatch filtered by current channel membership;
- Chinese-safe mentions for humans and AI;
- member-aware right panel;
- product-safe errors and audit logs.

High-value next:

- reply threads;
- pinned messages drawer;
- channel search with filters for author, pinned, date, and attachments;
- reactions;
- typing indicators;
- read receipts;
- unread and mention counters;
- per-channel notification preference;
- attachments and file previews;
- channel topics or work threads for long-running coding discussions.

Useful but defer:

- slash commands for `/邀请`, `/总结`, `/任务`, `/文件`, `/计划`;
- workflow action cards embedded in messages;
- retention policy and pruning;
- role-based moderation tools;
- channel templates;
- audio/video calls;
- federation or end-to-end encryption.

Not aligned right now:

- omnichannel customer support inbox;
- public community server discovery;
- Matrix federation;
- enterprise compliance retention UI before the collaboration loop is proven.

## Dependency Order

### Phase F0: Contract And Membership Foundation

Goal: define the shared model before touching UI behavior.

Tasks:

1. define `ChannelMember`, `ChannelMemberRole`, `ChannelMemberPermission`, and `ChannelMemberStatus` in shared contracts;
2. define `MessageAuthor` response shape;
3. document the migration boundary from `conversation_shares` to first-class channel membership;
4. define permission semantics for read, comment, and manage;
5. write contract tests for validation.

Checkpoint:

- the frontend and backend can agree on one member list shape for both humans and AI 同事.

### Phase F1: Real Human Coworkers In Channels

Goal: make `邀请真实同事进频道` a real backend behavior.

Tasks:

1. add channel user membership persistence;
2. backfill owner as an active human member for existing conversations;
3. expose channel member list API;
4. add existing workspace user invite API;
5. connect external email invite API to workspace invitations;
6. add remove/update permission APIs;
7. replace message ownership checks with channel access checks;
8. add `authorUserId` to new human messages;
9. update message list response to include human author display summary;
10. add audit events for member add, member remove, and permission change.

Checkpoint:

- another workspace user can be added to a channel, open it, read history, and send a message under their own display name.

### Phase F2: Member Panel And Invite UX

Goal: make channel membership visible and operable in the chat window.

Tasks:

1. replace the current right member panel with unified `成员与权限`;
2. add `邀请同事` flow for workspace users;
3. add email invite pending state;
4. keep `新建 AI 同事` in the panel;
5. add remove action with confirmation;
6. show correct counts for humans and AI 同事;
7. show empty states separately for humans and AI 同事;
8. add responsive drawer behavior for small screens.

Checkpoint:

- from the channel page, the user can see and manage both human coworkers and AI 同事 without leaving the channel.

### Phase F3: Human And AI Mentions

Goal: make mentions usable in Chinese and make dispatch behavior match selected members.

Tasks:

1. replace `AgentMentionInput` with a general `MemberMentionInput`;
2. support human and AI mention chips;
3. keep Chinese display names intact in mention labels;
4. add `mentionedUserIds`;
5. validate mentioned IDs against active channel members;
6. route AI dispatch only to active mentioned AI 同事 when explicit targets exist;
7. store human mentions for future inbox notifications.

Checkpoint:

- `@软件工程师`, `@张三`, and selected AI/human chips work without broken labels or stale dispatch.

### Phase F4: Message Readability And Actions

Goal: bring the chat window closer to mature team chat quality.

Tasks:

1. add message timestamps;
2. add author avatars/initials;
3. group consecutive messages by author and day;
4. add date dividers;
5. move pin into a compact action menu;
6. add copy message;
7. add reply/thread placeholder;
8. add pinned-message drawer;
9. add message search entry point.

Checkpoint:

- channel history is readable with multiple human and AI authors.

### Phase F5: Realtime Collaboration Signals

Goal: make channels feel live without adding noise.

Tasks:

1. add typing event contract;
2. emit typing started/stopped from the composer;
3. render typing state in the chat thread;
4. add read receipt persistence;
5. mark channel as read when opened;
6. show unread counts in channel overview and left navigation;
7. create mention inbox items for human mentions;
8. add per-channel notification preference placeholder.

Checkpoint:

- users can tell whether a channel has unread work, who is active, and whether their message was seen.

### Phase F6: Threads, Reactions, Files

Goal: add the highest-value mature chat features after membership is correct.

Tasks:

1. add reply/thread data model;
2. add thread drawer;
3. add reaction data model;
4. add reaction picker with a small default set;
5. add attachment upload to composer;
6. show file previews in thread and `文件` tab;
7. ensure AI 同事 can use explicitly attached or selected files as context;
8. add search filters for attachments, pinned, author, and date.

Checkpoint:

- longer coding conversations can be split into threads, reactable, searchable, and file-backed.

### Phase F7: AI Collaboration Actions

Goal: use the channel as the shared workspace where AI 同事 can perform useful work from chat context.

Tasks:

1. add `让 AI 总结当前频道` action;
2. add `从这条消息创建任务` action;
3. add `让 AI 评审这段讨论` action;
4. add `让 AI 生成计划` action;
5. allow user to select one or more messages as AI context;
6. make AI action cards persist as channel messages or artifacts;
7. ensure deleted/removed AI 同事 cannot be selected or dispatched.

Checkpoint:

- channel chat becomes the control surface for AI-assisted work, not just a transcript.

### Phase F8: Security, Tests, And Acceptance

Goal: prove the real collaboration loop.

Tasks:

1. API tests for member list, add, remove, permission update;
2. API tests for shared user read/send access;
3. API tests that non-members cannot read/send;
4. API tests that removed AI 同事 is not dispatched;
5. migration tests for existing owner conversations;
6. web tests for member panel, invite flow, mention picker, and composer permissions;
7. browser test for two users in one channel;
8. browser test for one human user plus two AI 同事 in one channel;
9. audit log verification for membership events;
10. documentation update for demo runbook.

Checkpoint:

- a real user can invite another human coworker and an AI 同事 into one channel, chat with both, and observe correct permissions and message authorship.

## Acceptance Criteria

Phase F is complete when:

- channel member list includes the current user, invited human coworkers, and AI 同事;
- an existing workspace user can be invited into a channel and send messages;
- an external email invite creates a pending workspace/channel membership path;
- human-authored messages show the correct author, not just `你`;
- AI-authored messages show the correct AI 同事 name;
- message send/read access is based on channel membership and permission, not only conversation ownership;
- AI dispatch uses active channel AI membership;
- removed AI 同事 no longer receives channel messages;
- Chinese mentions work for both humans and AI 同事;
- the channel page remains two-column and understandable;
- tests cover the real multi-human + AI 同事 channel loop.

## Risks And Mitigations

- Risk: changing message ownership can break existing conversations.
  Mitigation: keep `ownerUserId` as namespace and add `authorUserId` instead of replacing the field.
- Risk: `conversation_shares` and channel memberships may conflict.
  Mitigation: define a one-way migration/bridge and make the new member API authoritative.
- Risk: inviting external emails without accepted workspace membership creates confusing access state.
  Mitigation: represent them as `pending`, not as active channel members.
- Risk: realtime stream events for AI output and human chat events may collide.
  Mitigation: separate event kinds for message persistence, AI delta, typing, read receipts, and membership changes.
- Risk: notification noise can make channels unusable.
  Mitigation: default to mentions/unread only; add per-channel notification preference later.
- Risk: permission bugs can expose private channel history.
  Mitigation: centralize access checks in one channel access service and test deny cases first.

## Open Questions

- Should external invitees be able to see channel history after they accept, or only messages after join time?
- Do we need guest users in this phase, or only full workspace members?
- Should AI 同事 count as billable channel members in the UI, billing, or both?
- Should reply threads be strict threads or lighter `引用回复` first?
- Should channel topics be introduced as a separate feature, or should coding tasks serve the same organizational role for now?
