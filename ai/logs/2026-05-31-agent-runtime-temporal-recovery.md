# 2026-05-31 Agent Runtime Temporal Recovery

## Symptom

- 用户在 `软件工程师 session` 中发送消息后，只看到用户消息，没有 AI 同事回复。
- 用户已配置 DeepSeek API，前端登录状态正常。

## Evidence

- 会话 `5b077a65-c937-4180-8d3d-6a6a8c4a415f` 存在，标题是 `软件工程师 session`。
- 会话绑定了一个 AI 同事：
  - agent name: `软件工程师`
  - provider: `deepseek`
- 工作区 `default-workspace` 下存在 `deepseek` 的有效用户自带凭证。
- API 日志显示派发已进入 deepseek direct path，但失败在后台运行时连接：
  - `provider.dispatch.direct`
  - `error: Failed to connect before the deadline`

## Root Cause

- `temporal` 服务未运行，`localhost:7233` 没有监听。
- `worker` 进程未运行，因此即使 API 收到用户消息，也没有后台 workflow 执行 AI 同事调用。
- API 是异步派发：`POST /messages/send` 会先保存用户消息并返回 `202`，如果后台 runtime 缺失，用户消息会留下，但不会生成 assistant 消息。

## Recovery

1. 启动 Temporal：

   ```bash
   docker compose -f infra/docker/compose.dev.yml up -d temporal
   ```

2. 启动 worker：

   ```bash
   pnpm --filter worker dev
   ```

3. 重启 API，让它重新建立 Temporal client：

   ```bash
   pnpm --filter api dev
   ```

## Verification

- 发送调试消息：
  - `系统调试第二次：如果你已恢复，请用一句中文说明你能收到消息。`
- API 日志结果：
  - `provider.dispatch.direct`
  - `result: ok`
  - `durationMs: 1986`
- 数据库中新增 assistant 消息：
  - `已恢复，我能正常收到消息。`

## Follow-Up

- 旧失败消息不会自动补偿，因为当时 workflow 没有成功启动。
- 下次如果出现“用户消息有、AI 不回复”，优先检查：
  - `ss -ltnp | rg 7233`
  - `pgrep -af "pnpm.*worker|tsx watch src/main"`
  - API 日志中的 `provider.dispatch.failed`
