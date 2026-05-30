# 2026-05-31 Agent Harness 设计与多 Agent 回复修复

## 触发问题

- 左侧工作区下方的当前工作区胶囊右侧仍有轻微溢出。
- 用户在频道中发送“请为我设计一个登录页面的逻辑 包括注册 @技术负责人1 @软件工程师”后，认为多 Agent 没有回复。
- 需要核对原始需求是否说明 Agent 跑在哪里。
- 需要把 Agent Harness 知识转成用户能理解的新建同事设计。

## 证据

- `docs/product/original-requirements.md` 未指定 Agent 必须跑在浏览器、本地或云端，但要求 IM 交互、群聊协作、Orchestrator、统一适配器和桌面端 Agent 进程管理扩展。
- 数据库中用户消息已包含两个 `mentioned_agent_ids`。
- API 日志显示 `targetAgentCount=2`，Worker 日志显示两个 DeepSeek Agent 都执行成功。
- 旧行为把两个 Agent 的输出合成一条 `sourceAgentId=null` 的助手消息，前端看起来不像两个同事分别回复。
- 真实 DeepSeek 群聊调用耗时约 59 秒，旧前端兜底刷新只覆盖 1.2 秒、4 秒、8 秒。

## 修复

- 群聊调度成功后按 `execution.state.results` 为每个 AI 同事分别创建助手消息，并写入各自 `sourceAgentId`。
- 部分失败时额外创建一条中文失败摘要，说明哪些 AI 同事没有完成。
- 前端发送后的兜底刷新扩展到 90 秒，覆盖真实模型慢响应。
- 工作区胶囊收窄并左移 2px，避免右侧顶出卡片。
- 新建同事增加“协作护栏”：任务边界、上下文资料包、工具权限、审批护栏、过程记录、失败恢复、质量检查。
- 新增 `docs/product/agent-harness-new-teammate-design-report.md`，把 Agent Harness 转成可答辩、可落地的用户语言。

## 验证

- `pnpm --filter web exec vitest run --config vitest.config.ts src/features/teammates/teammate-create-wizard.spec.tsx src/features/settings/model-connections-panel.spec.tsx`
- `pnpm exec vitest run tests/integration/group-orchestrator.spec.ts`
- `pnpm exec vitest run tests/integration/phase-a-runtime-baseline.spec.ts`
- `pnpm --filter web lint`
- `pnpm --filter web build`
- `pnpm --filter api build`

## 未收口项

- `pnpm --filter api lint` 仍失败，原因是仓库既有 lint 债务：未使用变量和类型导入规则问题，非本次改动新增。

## 追加修复：频道消息无反馈与静态聊天 UI

### 触发问题

- 用户在频道里发送“我想要做一个3d打印的软件 需要根据人的的头部自动调节图纸头盔的大小”后没有看到 AI 同事回复。
- 聊天窗口在模型执行期间没有明显实时状态，看起来像静态页面。
- 每条消息后的 `👍`、`✅`、`👀` 反应按钮不符合协作软件语义，需要移除。

### 证据

- 数据库已写入该用户消息，`conversation_id=5b077a65-c937-4180-8d3d-6a6a8c4a415f`，但当时没有后续 assistant 消息。
- 进程表显示 API 和 Web 在运行，worker 进程缺失；worker 启动后立刻消费该频道的 DeepSeek 任务。
- worker 日志显示一个 AI 同事返回约 3583 字，另一个返回约 3567 字，但旧 `startToCloseTimeout=1 minute` 会让真实 DeepSeek 流式调用超过 60 秒时被 Temporal 判定超时并重试。
- 开发环境中还残留旧测试 workflow 在重试，说明缺凭证等非重试错误没有被明确标记为 non-retryable。

### 修复

- 将单 Agent 和群组 Agent activity 超时从 1 分钟提高到 5 分钟，匹配真实模型慢响应。
- 为缺少模型连接凭证新增 `ProviderCredentialError`，并把它标记为 Temporal non-retryable，避免无限重试。
- 将非重试型 `AgentAdapterError` 转成 Temporal non-retryable activity failure。
- 用户发送频道/会话消息后，如果当前对话存在 AI 同事，立即显示“AI 同事正在处理你的消息”的实时占位和动态输入点。
- 当 SSE delta/completed 或持久化 assistant 消息刷新回来后，自动清除占位。
- 移除每条消息后的 `👍`、`✅`、`👀` 反应按钮，保留“复制”“回复”“置顶”等协作动作。

### 验证

- `pnpm --filter worker exec vitest run test/activity-errors.spec.ts test/group-orchestrator.workflow.spec.ts test/single-agent.workflow.spec.ts`
- `pnpm --filter web exec vitest run --config vitest.config.ts src/features/chat/chat-message.spec.tsx src/features/channels/channel-shell.spec.tsx`
- `pnpm --filter web lint`
- `pnpm --filter web build`
- `pnpm --filter worker lint`
- `pnpm --filter worker build`
- 已确认数据库中该 3D 打印头盔需求消息后追加了软件工程师回复和中文部分失败提示。
- 已终止本地开发环境里两个旧测试 workflow 的无限重试，避免继续污染 worker 日志。
