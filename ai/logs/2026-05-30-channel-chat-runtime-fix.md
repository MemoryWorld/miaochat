# 2026-05-30 Channel Chat Runtime Fix

## Goal

修掉两个直接影响频道体验的问题：

- 聊天时间线里频繁显示 `流状态：异常`
- 从频道列表进入具体频道后只能看历史记录，不能直接发言

## Root Causes

### 1. 前端把 SSE 断线重连当成硬错误

`useConversationStream` 的 `EventSource.onerror` 直接把状态置为：

- `connectionState = "error"`
- `errorMessage = "Conversation stream disconnected."`

但浏览器的 `EventSource` 在断线后本来就会自动重连。
这个行为更接近“连接中”，不是用户层面的异常。

### 2. 频道页只做了只读 surface，没有接入聊天执行链

`ChannelShell` 之前只拉：

- 历史 messages
- approvals
- activity
- files

但没有接：

- `useConversationStream`
- `ChatThread`
- `ChatComposer`
- `POST /messages/send`

所以它本质上只是一个频道只读壳层。

## What Changed

### Stream State

`useConversationStream` 调整为：

- SSE `onerror` 时显示 `connecting`
- 不再把自动重连过程直接暴露成 `error`
- 仍然保留对非法流 payload 的错误保护

### Channel Chat

`ChannelShell` 现在接上了真实聊天链路：

- 额外读取 `/conversations?workspaceId=...` 以拿到参与成员名称
- 通过 `useConversationStream` 订阅当前频道的流式事件
- 使用 `ChatThread` 统一展示：
  - 历史消息
  - 流状态
  - live assistant message
  - workflow status cards
- 使用 `ChatComposer` 在频道内直接发消息
- `conversation.message.completed` 后刷新频道消息，保证 assistant 回写进入正式时间线
- 频道内 pin message 也接上了现有接口

## Tests Added Or Updated

- `useConversationStream`
  - 新增回归：瞬时断流应显示 `connecting`，不应落到 `error`

- `ChannelShell`
  - 新增回归：打开频道后能看到输入框
  - 能发送消息到 `POST /messages/send`
  - 能在流式完成后刷新并显示 assistant 响应

## Verification

- `pnpm --filter web exec vitest run src/features/chat/use-conversation-stream.spec.tsx src/features/channels/channel-shell.spec.tsx`
- `pnpm --filter web exec vitest run src/features/chat/chat-experience.spec.tsx src/components/app-shell.spec.tsx src/features/teammates/teammate-directory-page.spec.tsx src/features/workspace-shell/use-surface-data.spec.tsx`
- `pnpm --filter web build`
