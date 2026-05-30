# 2026-05-30 Navigation Prune And Channel Flicker Fix

## Goal

收掉两类直接影响客户观感的问题：

- 左侧工作栏里 `工作台 / 直接协作` 指向同一路径，`AI 同事` 也会把人带进一个重复目录，信息层级不清楚
- 打开频道页时出现明显屏闪，像是整页不断重载

## Root Causes

### 1. 左侧导航存在重复入口

`WorkspaceNavigation` 同时保留了：

- `工作台 -> /`
- `直接协作 -> /`

这两个入口没有真实语义差异，只是在客户视角制造重复选择。
另外 `AI 同事` 作为主导航一级入口也过早暴露了内部成员目录概念，而当前产品叙事已经转向“在频道里协作和管理”。

### 2. 频道页屏闪不是样式问题，而是数据 hook 自旋

`ChannelShell` 同时挂了多组 `useSurfaceData(..., []) / useSurfaceData(..., null)`。
而 `useSurfaceData` 的 `refresh` 依赖 `fallback`：

- 调用方每次 render 都会生成新的 `[]`
- `refresh` 跟着变
- `useEffect([refresh])` 反复触发
- 相同 URL 被连续重复请求

结果就是频道页在请求、loading、渲染之间来回抖动，看起来像屏闪。

## What Changed

### Navigation

左侧主导航收敛为：

- `工作台 / 收件箱 / 任务 / 日历`
- `频道`
- `设置`

明确移除：

- `直接协作`
- `AI 同事`

保留：

- 侧栏顶部 `新建同事`
- `/teammates` 路由本身

### Teammates Route

`/teammates` 改成极简空壳：

- 只保留“创建同事”的说明
- 强调“创建完成后，后续管理和协作回到频道里继续推进”
- 不再展示：
  - 默认编码团队
  - 自定义 AI 同事目录
  - 查看成员设置

### Surface Data Stability

`useSurfaceData` 改成：

- 用 `ref` 持有最新 fallback
- `refresh` 只依赖 `url`
- fallback 变化只用于本地重置，不再触发自动重新拉取

这样调用方即使用内联 `[]` 或 `{}`，只要 `url` 没变，就不会再次发请求。

## Tests Added Or Updated

### Navigation / Shell

- `ChatExperience` 导航断言更新
  - 不再出现 `AI 同事`
  - 不再出现 `直接协作`
  - `新建同事` 仍然存在
- `AppShell` 增加同样的导航收口断言

### Teammates Page

- 新增 `TeammateDirectoryPage` 测试
  - 页面改成轻量创建入口
  - 不再渲染目录式内容

### Surface Data Hook

- 新增 `useSurfaceData` 回归测试
  - 调用方传入内联 fallback 时不会重复请求
  - 手动 rerender 且 URL 不变时不会再次 fetch

## Verification

- `pnpm --filter web exec vitest run src/components/app-shell.spec.tsx src/features/chat/chat-experience.spec.tsx src/features/teammates/teammate-directory-page.spec.tsx src/features/workspace-shell/use-surface-data.spec.tsx`
- `pnpm --filter web exec vitest run src/features/channels/channel-shell.spec.tsx`
- `pnpm --filter web build`
