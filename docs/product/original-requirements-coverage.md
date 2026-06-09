# Original Requirements Coverage

> 对照来源：`docs/product/original-requirements.md`
> 对照时间：2026-06-06
> 范围：比赛原始课题交付物与核心功能。`3` 分钟 Demo 视频仍由人工录制，不在本次代码收口范围内。

## 结论

Miaochat 当前分支已经具备比赛原始课题要求的主要可运行交付形态：产品设计文档、技术文档、可运行 Demo、AI 协作开发记录、IM 聊天、多 Agent 协作、Agent 接入、自建 AI 同事、产物预览编辑和部署卡片均有源码、文档和自动化测试覆盖。移动端已经从组件骨架升级为 Expo MVP，可登录现有 API、查看会话、处理审批并预览产物；桌面端已经从声明式 manifest 升级为 Electron MVP，可启动 Web 壳、暴露文件选择/系统通知/本地 Agent IPC。部署链路已经从状态卡片 stub 扩展到 Vercel 静态站点、Fly.io container preview 和 S3/R2 源码下载对象的真实 provider adapter，并提供 `pnpm deploy:acceptance:real` 做外部 URL 回读验收。

仍需人工完成：`3` 分钟 Demo 视频、移动端 Android/iOS 可安装 App 实机或模拟器录屏、桌面端 Electron 启动录屏、真实 OpenCode-backed 模型 Key 浏览器验收。正式发布门禁中的 staging secrets-backed 运行和 3000 VU/500 并发正式 k6 压测继续记录在 `docs/operations/release-checklist.md` 和 `docs/operations/load-test-results.md`。

## 交付物覆盖

| 原始交付物 | 当前状态 | 证据 |
| --- | --- | --- |
| 产品设计文档 | 已完成 | `docs/product/product-design.md`、`docs/product/agent-harness-new-teammate-design-report.md`、`docs/product/*plan*.md` |
| 技术文档 | 已完成 | `docs/architecture/*.md`、`docs/operations/*.md`、`docs/agent harnessdesign/*.md` |
| 可运行 Demo | 已完成 | `docs/product/demo-script.md`、`docs/product/phase-a-demo-runbook.md`、`tests/e2e-playwright/harness.spec.ts` |
| AI 协作开发记录 | 已完成 | `ai/logs/*.md`、`ai/specs/*.md`、`ai/tasks/*.md`、`ai/rules/README.md` |
| 3 分钟 Demo 视频 | 待人工录制，需包含移动端画面 | `docs/product/demo-video-checklist.md` |

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
| 部署指令、部署状态卡片、预览 URL、静态/容器/源码交付链路 | 已完成源码接入；真实凭证验收已通过 `mq12ewk6s9z39` | `tests/e2e/deploy-command.spec.tsx`、`apps/worker/test/deploy-artifact.workflow.spec.ts`、`apps/worker/test/deploy-provider-adapters.spec.ts`、`tests/deploy-acceptance-support.spec.ts`、`tests/integration/deploy-targets.spec.ts` |
| Web 主力端完整 IM 体验、代码编辑、全功能 | 已完成 | `pnpm --filter web test`、`pnpm --filter web build`、`tests/e2e-playwright/harness.spec.ts` |
| 移动端轻量 IM：查看对话、审批确认、产物预览 | 已完成源码 MVP；最终证据需 Android/iOS 可安装 App 录屏，Expo Go/手机浏览器不算最终移动端交付 | `apps/mobile/App.tsx`、`apps/mobile/src/shell/mobile-shell.tsx`、`apps/mobile/test/approval-card.spec.tsx`、`apps/mobile/test/mobile-api.spec.ts`、`docs/operations/mobile-installable-acceptance.md` |
| 桌面端本地文件访问、系统通知、Agent 进程管理 | 已完成 Electron MVP，待桌面启动/打包人工验收 | `apps/desktop/src/electron-main.ts`、`apps/desktop/src/preload.cts`、`apps/desktop/src/desktop-ipc.ts`、`apps/desktop/test/desktop-ipc.spec.ts` |

## Diff 应用边界

消息级 `应用 Diff` 会读取对应 diff artifact 的 `previewUrl`，计算 patch 内容 digest，并调用 `POST /artifacts/:id/revisions` 记录为新的 artifact revision。这个闭环提供了可审计的“已接受/已应用”产物版本记录；当前不会直接改写用户本地 git 工作树或外部仓库文件。

## 部署边界

当前部署能力覆盖比赛原始需求中的交互链路：聊天中发送 `/deploy`，后端创建部署记录，worker 进入对应 target kind 分支，前端渲染部署状态卡片与预览/下载入口。新增真实部署验收脚本会创建 artifact manifest，分别触发三类 target，并回读外部 URL 中的 run marker。

- `static-site`：`provider: "vercel"` 会读取 artifact bundle，调用 Vercel deployment API，返回真实 preview URL。
- `container`：`provider: "fly"` 会创建 Fly app/Machine，用 Nginx 承载 artifact HTML，返回 `*.fly.dev` URL。
- `source-archive`：`provider: "s3-compatible"` 会把 artifact object 发布到 S3/R2 公开前缀，返回公开下载 URL。
- 真实 provider 验收已在 2026-06-06 使用 operator-provided credentials 通过：run `mq12ewk6s9z39` 同时产出并回读 Vercel static preview、Fly.io container preview 和 R2 source archive URL。

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
| `pnpm --filter mobile test` | 6 passed |
| `./node_modules/.bin/tsc -p apps/mobile/tsconfig.json --noEmit --pretty false` | passed |
| `./node_modules/.bin/eslint apps/mobile/App.tsx apps/mobile/src apps/mobile/test` | passed |
| `pnpm --filter mobile exec expo install --check` | dependencies up to date |
| `pnpm --filter mobile exec expo config --type public` | SDK 56 config generated for `ios`/`android`/`web` |
| `timeout 20s bash -lc 'EXPO_PUBLIC_API_BASE_URL=http://localhost:3001 pnpm --filter mobile start -- --host localhost --port 8082'` | Development-only Metro smoke reached `Waiting on http://localhost:8082`; not counted as final mobile delivery evidence |
| `EXPO_PUBLIC_API_BASE_URL=http://<device-reachable-api>:3001 pnpm mobile:android:release` | pending manual Android SDK/device run |
| `EXPO_PUBLIC_API_BASE_URL=http://<device-reachable-api>:3001 pnpm mobile:ios:release` | pending user Mac/Xcode run |
| `pnpm --filter desktop test` | 8 passed |
| `pnpm --filter desktop build` | passed |
| `pnpm --filter desktop lint` | passed |
| `pnpm exec vitest run tests/deploy-acceptance-support.spec.ts` | 2 passed |
| `node --env-file=.env $(which pnpm) deploy:acceptance:real` | passed with run `mq12ewk6s9z39`; Vercel/Fly/R2 external URL readback succeeded |
| `pnpm --filter web test` | 58 passed |
| `pnpm build` | 12 successful |
| `git diff --check` | passed |
