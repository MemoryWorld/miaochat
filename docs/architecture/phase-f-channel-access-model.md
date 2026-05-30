# Phase F Channel Access Model

## Status

Accepted for Phase F implementation.

## Product Vocabulary

- `频道`: the shared collaboration room.
- `成员`: any participant visible in the channel roster.
- `同事`: a human workspace member.
- `AI 同事`: an automated teammate that can participate in channel work.

Internal runtime and provider names are not part of this model.

## Permissions

### read

Can:

- open the channel;
- read channel history;
- view files and pinned messages;
- receive mention inbox items.

Cannot:

- send messages;
- invite or remove members;
- trigger AI 同事 execution.

### comment

Includes `read`.

Can:

- send messages;
- mention human coworkers;
- mention active AI 同事;
- use approved chat actions that do not change membership.

Cannot:

- invite or remove members;
- change member permissions.

### manage

Includes `comment`.

Can:

- invite existing workspace members into the channel;
- start an external email invitation flow;
- remove non-owner members;
- change read/comment permissions.

Cannot:

- remove the last required owner/admin member;
- bypass workspace-level role checks.

## Roles

### owner

The workspace owner or channel owner. Always has `manage`.

### admin

A trusted human workspace member. Can have `manage` when explicitly granted.

### member

Normal human coworker. Defaults to `comment`.

### guest

External or limited human coworker. Defaults to `read` unless upgraded.

### ai_teammate

AI 同事. Always uses `comment` semantics and cannot manage members.

## Status

### active

Human member can use the channel according to permission.

### pending

Human invite exists, but the user has not accepted or joined. Pending users are visible in the roster but cannot read or send.

### disabled

Human member is present historically but cannot read or send.

### available

AI 同事 can be selected or dispatched.

### running

AI 同事 is actively working.

### removed

Removed members must not appear as active members and must not receive dispatch. Historical messages remain visible to users who still have channel access.

## Access Rules

- Workspace owner can read, comment, and manage every channel in the workspace.
- Active human members can read when permission is `read`, `comment`, or `manage`.
- Active human members can send when permission is `comment` or `manage`.
- Active human members can manage when permission is `manage`.
- Pending, disabled, removed, and non-members cannot read or send.
- AI 同事 can only be dispatched when it is an active channel member.
- A human-only message should persist without forcing AI execution.
- A message that explicitly mentions an unavailable AI 同事 should return a Chinese product-safe error.

## Message Authorship

- `ownerUserId` remains the workspace/conversation owner namespace.
- `authorUserId` records the human sender when a human sends a message.
- `sourceAgentId` records the AI 同事 sender when AI writes a message.
- API responses should include an author summary so the frontend does not infer display labels from role alone.

## Deny Cases

- Non-member reads channel history: deny.
- Read-only member sends message: deny.
- Pending invitee opens channel before accepting: deny.
- Removed AI 同事 is mentioned: deny with a Chinese error.
- User tries to remove the last owner/admin: deny.
