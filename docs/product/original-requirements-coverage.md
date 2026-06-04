# Original Requirements Coverage

> 对照来源：`docs/product/original-requirements.md`
> 对照时间：2026-06-04
> 范围：比赛原始课题交付物与核心功能。`3` 分钟 Demo 视频仍由人工录制，不在本次代码收口范围内。

## 结论

除 `3` 分钟 Demo 视频外，Miaochat 当前分支已经具备比赛原始课题要求的可运行交付形态：产品设计文档、技术文档、可运行 Demo、AI 协作开发记录、IM 聊天、多 Agent 协作、Agent 接入、自建 AI 同事、产物预览编辑、部署卡片与多端骨架均有源码、文档和自动化测试覆盖。源码交付链路现在会基于 artifact storage key 产出对象存储下载 URL。

正式发布门禁中的真实 DeepSeek Key 人工验收、staging secrets-backed 运行、真实云厂商发布凭证和 3000 VU/500 并发正式 k6 压测属于发布验收项，不是原始课题交付物本身；它们继续记录在 `docs/operations/release-checklist.md` 和 `docs/operations/load-test-results.md`。

## 交付物覆盖

| 原始交付物 | 当前状态 | 证据 |
| --- | --- | --- |
| 产品设计文档 | 已完成 | `docs/product/product-design.md`、`docs/product/agent-harness-new-teammate-design-report.md`、`docs/product/*plan*.md` |
| 技术文档 | 已完成 | `docs/architecture/*.md`、`docs/operations/*.md`、`docs/agent harnessdesign/*.md` |
| 可运行 Demo | 已完成 | `docs/product/demo-script.md`、`docs/product/phase-a-demo-runbook.md`、`tests/e2e-playwright/harness.spec.ts` |
| AI 协作开发记录 | 已完成 | `ai/logs/*.md`、`ai/specs/*.md`、`ai/tasks/*.md`、`ai/rules/README.md` |
| 3 分钟 Demo 视频 | 待人工录制 | `docs/product/demo-video-checklist.md` |

## 核心功能覆盖

| 原始需求 | 当前状态 | 证据 |
| --- | --- | --- |
| 左侧会话列表、新建、置顶、归档、搜索、最近活跃排序 | 已完成 | `tests/e2e/conversation-list-features.spec.tsx`、`tests/e2e-playwright/harness.spec.ts` |
| 单聊模式 | 已完成 | `tests/e2e/single-agent-mock.spec.tsx`、`apps/api/test/messages.contract-spec.ts` |
| 群聊协作与 Orchestrator 分派 | 已完成 | `tests/integration/group-orchestrator.spec.ts`、`tests/e2e/group-failure.spec.tsx`、`packages/domain/test/multi-agent-harness.spec.ts` |
| 聊天上下文连续与 pin 长期上下文 | 已完成 | `tests/e2e/pinned-context.spec.tsx`、`tests/integration/pinned-context.spec.ts` |
| 文本、代码、附件、网页预览、Diff、部署状态卡片 | 已完成 | `tests/e2e/inline-attachments.spec.tsx`、`tests/e2e/artifact-cards.spec.tsx`、`tests/e2e/diff-card-rich.spec.tsx`、`tests/e2e/deploy-command.spec.tsx` |
| 回复、引用、重新生成、复制、Diff 操作、展开预览 | 已完成 | `tests/e2e/message-actions.spec.tsx`、`tests/e2e/artifact-cards.spec.tsx`、`apps/web/src/features/chat/chat-message.spec.tsx`、`tests/e2e/artifact-code-editor.spec.tsx` |
| Orchestrator 拆解、聚合、失败降级、冲突处理 | 已完成 | `packages/domain/src/orchestration/orchestrator-state.ts`、`packages/domain/test/orchestrator-state.spec.ts`、`apps/api/test/multi-agent-harness.service.spec.ts` |
| 至少 2 个主流 Agent 平台适配 | 已完成 | Claude Code 走官方 `@anthropic-ai/claude-agent-sdk`，Codex 走官方 `@openai/codex-sdk`；覆盖见 `packages/agent-adapters/test/claude-code-adapter.spec.ts`、`packages/agent-adapters/test/codex-adapter.spec.ts`、`tests/e2e/claude-code-real.spec.ts`、`tests/e2e/codex-real.spec.ts` |
| 用户自建 Agent / AI 同事 | 已完成 | `tests/e2e/custom-agent-ui.spec.tsx`、`tests/e2e/heavy-agent-management.spec.tsx`、`apps/api/test/custom-agents.e2e-spec.ts` |
| Agent 作为联系人展示头像、名称、能力标签 | 已完成 | `tests/e2e/custom-agent-ui.spec.tsx`、`apps/web/src/features/teammates/*.spec.tsx` |
| 产物内联预览、全屏预览、代码编辑器、版本历史 | 已完成 | `tests/e2e/artifact-cards.spec.tsx`、`tests/e2e/artifact-code-editor.spec.tsx`、`tests/integration/artifact-revisions.spec.ts` |
| 对话式局部修改产物 | 已完成 | `apps/web/src/features/chat/artifact-edit-dispatcher.tsx`、`apps/worker/src/activities/artifact-drafts.ts`、`tests/e2e-playwright/harness.spec.ts` |
| 部署指令、部署状态卡片、预览 URL、静态/容器/源码交付链路 | 已完成（比赛 Demo 级） | `tests/e2e/deploy-command.spec.tsx`、`apps/worker/test/deploy-artifact.workflow.spec.ts`、`tests/integration/deploy-workflow.spec.ts`、`tests/integration/deploy-targets.spec.ts` |
| Web 主力端、桌面端/移动端 P2 骨架 | 已完成 | `tests/e2e/desktop-agent-supervisor.spec.tsx`、`ai/specs/2026-05-22-task-62-desktop-shell.md`、`ai/specs/2026-05-22-task-64-mobile-shell.md` |

## Diff 应用边界

消息级 `应用 Diff` 会读取对应 diff artifact 的 `previewUrl`，计算 patch 内容 digest，并调用 `POST /artifacts/:id/revisions` 记录为新的 artifact revision。这个闭环提供了可审计的“已接受/已应用”产物版本记录；当前不会直接改写用户本地 git 工作树或外部仓库文件。

## 部署边界

当前部署能力覆盖比赛原始需求中的交互链路：聊天中发送 `/deploy`，后端创建部署记录，worker 进入对应 target kind 分支，前端渲染部署状态卡片与预览/下载入口。

- `source-archive`：基于 artifact 的 `storageKey` 生成对象存储下载 URL，作为源码打包下载入口。
- `static-site`：完成目标、密钥、状态流转与结果卡片；真实 Netlify/S3/Vercel 发布仍需接入 provider SDK 或 CI job。
- `container`：完成目标、密钥、状态流转与结果卡片；真实镜像 build/push/Kubernetes 发布仍需接入 registry/buildkit/deployer。

## 本轮旧场景修复

`tests/e2e-playwright/harness.spec.ts` 中 7 个旧场景失效的共同原因是 Playwright mock 仍拦截旧的 `http://localhost:3001/**` 直连 API，而 Web 端已经迁移到 Next `/api/**` 代理；另有 heavy-agent 表单标签已经中文化。已改为拦截 `/api/**`，并更新中文控件名。

本轮重新通过的旧场景包括：产物编辑保存、会话置顶、Heavy Agent 创建、分享会话、共享审计、工作区审计、成员邀请。

## 本轮验证

| 命令 | 结果 |
| --- | --- |
| `./node_modules/.bin/playwright test tests/e2e-playwright/harness.spec.ts` | 10 passed |
| `./node_modules/.bin/vitest run --no-file-parallelism tests/e2e/message-actions.spec.tsx tests/e2e/diff-card-rich.spec.tsx tests/e2e/deploy-command.spec.tsx apps/web/src/features/chat/chat-composer.spec.tsx apps/web/src/features/chat/chat-message.spec.tsx apps/web/src/features/chat/chat-experience.spec.tsx apps/web/src/features/channels/channel-shell.spec.tsx tests/demo-phase-a-check.spec.ts tests/demo-phase-a-seed.spec.ts` | 28 passed |
| `./node_modules/.bin/eslint tests/e2e-playwright/harness.spec.ts apps/web/src/features/chat/message-actions-menu.tsx apps/web/src/features/chat/chat-message.tsx apps/web/src/features/chat/chat-thread.tsx apps/web/src/features/chat/chat-composer.tsx apps/web/src/features/chat/chat-experience.tsx tests/e2e/message-actions.spec.tsx tests/e2e/deploy-command.spec.tsx tests/demo-phase-a-seed.spec.ts apps/web/src/features/chat/chat-message.spec.tsx apps/web/src/features/chat/chat-experience.spec.tsx` | passed |
| `./node_modules/.bin/tsc -p apps/web/tsconfig.json --noEmit --pretty false` | passed |
| `./node_modules/.bin/vitest run --no-file-parallelism apps/worker/test/deploy-source-archive.activity.spec.ts apps/worker/test/deploy-artifact.workflow.spec.ts apps/web/src/features/chat/deploy-command.spec.tsx tests/e2e/deploy-command.spec.tsx` | 8 passed |
| `cd apps/worker && ../../node_modules/.bin/tsc -p tsconfig.build.json --noEmit --pretty false` | passed |
| `./node_modules/.bin/eslint apps/worker/src/activities/deploy-source-archive.activity.ts apps/worker/src/activities/index.ts apps/worker/src/worker-options.ts apps/worker/src/workflows/deploy-artifact.workflow.ts apps/worker/test/deploy-source-archive.activity.spec.ts apps/worker/test/deploy-artifact.workflow.spec.ts apps/web/src/features/chat/deploy-command.spec.tsx tests/e2e/deploy-command.spec.tsx` | passed |
| `./node_modules/.bin/vitest run --no-file-parallelism tests/e2e/message-actions.spec.tsx tests/e2e/artifact-cards.spec.tsx tests/e2e/artifact-code-editor.spec.tsx apps/web/src/features/chat/chat-message.spec.tsx apps/web/src/features/chat/chat-experience.spec.tsx` | 15 passed |
| `./node_modules/.bin/tsc -p apps/web/tsconfig.json --noEmit --pretty false` | passed |
| `./node_modules/.bin/eslint apps/web/src/features/artifacts/digest.ts apps/web/src/features/chat/artifact-edit-dispatcher.tsx apps/web/src/features/chat/chat-experience.tsx apps/web/src/features/chat/chat-message.tsx apps/web/src/features/chat/chat-thread.tsx apps/web/src/features/chat/message-actions-menu.tsx tests/e2e/message-actions.spec.tsx tests/e2e/artifact-cards.spec.tsx tests/e2e/artifact-code-editor.spec.tsx apps/web/src/features/chat/chat-message.spec.tsx apps/web/src/features/chat/chat-experience.spec.tsx` | passed |
