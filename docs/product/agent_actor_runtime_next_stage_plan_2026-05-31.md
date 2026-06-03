# Agent Actor Runtime 下一阶段计划

日期：2026-05-31
范围：只覆盖 harness/runtime，不扩展无关 UI、营销页或新产品线。

## 结论

当前 Miaochat 的多同事能力已经从“聚合回复”推进到“同频道多名 AI 同事分别回复，并支持声明式 handoff 分波”。但它仍然主要是 request/response workflow：用户发消息，worker 调一轮模型，写回消息，然后结束。

下一阶段必须把 AI 同事提升为 Agent Actor：

```text
Agent Profile
  -> Durable Session
  -> Mailbox
  -> Wake Decision
  -> Harness Run
  -> State / Memory / Tool Intent
  -> Receipt / Trace / Checkpoint
```

这不是把某个固定岗位链路写死成流程，而是让用户定义的每个同事拥有持久身份、独立上下文、可恢复邮箱、可控心跳和可审计状态。

本轮已经落地第一层代码：

- `@agenthub/contracts` 新增 Agent Actor Runtime 契约。
- `@agenthub/domain` 新增纯函数调度核心。
- 单测覆盖 profile/session/mailbox/heartbeat/wake/预算/状态迁移/HEARTBEAT_OK 抑制。

## 外部机制吸收

### Hermes

来源：https://hermes-agent.nousresearch.com/docs/user-guide/features/overview

应吸收：

- Tools & toolsets：工具不是 prompt 附属物，而是可以按平台、角色、风险启停的能力集。
- Skills progressive disclosure：技能按需加载，避免所有知识一次性塞进上下文。
- Persistent memory：长期记忆必须有边界和审查，而不是把模型推测直接写入长期上下文。
- Context files / context references：上下文来源应有 manifest、引用和信任等级。
- Checkpoints & rollback：文件写入前自动快照，失败可回滚。
- Subagent delegation：子任务要有隔离上下文、受限工具集和独立终端/执行 lane。
- Provider routing / fallback / credential pools：运行时应能按成本、质量、错误和配额选择模型或降级。
- ACP / API server：同一个 agent runtime 可以接 IDE、Web、CLI、IM，不应该把 Web 频道写死成唯一入口。

不直接照搬：

- Hermes 是完整 assistant/runtime 产品，不是 Miaochat Web 频道的 drop-in 替换。
- 我们不把 Hermes 的 CLI/插件生态直接塞进当前 worker；只吸收 profile isolation、toolset、memory、checkpoint、delegation、routing 等机制。

### OpenClaw Heartbeat

来源：https://docs.openclaw.ai/gateway/heartbeat

应吸收：

- Heartbeat 是主会话里的周期 agent turn，不是后台任务记录。
- 默认静默：没有需要注意的事时返回 `HEARTBEAT_OK`，不要污染聊天流。
- `target: none` 默认不对外发消息；只有 alert 才进入用户可见渠道。
- `lightContext` 和 `isolatedSession` 控制心跳成本。
- `skipWhenBusy` 避免同一个 agent lane 重入。
- `activeHours` 避免夜间打扰。
- `HEARTBEAT_OK` 只在开头或结尾生效，中间出现不应被吞掉。

已经落地到契约/领域层：

- `AgentActorHeartbeatPolicy.enabled`
- `intervalMs`
- `target`
- `lightContext`
- `isolatedSession`
- `skipWhenBusy`
- `activeHours`
- `ackMaxChars`
- `maxWakeRunsPerHour`
- `quietWindowMs`
- `interpretAgentActorHeartbeatResponse`

### Pi / pi-crew

来源：https://pi.dev/packages/pi-crew

应吸收：

- durable state：manifest、tasks、events、artifacts 都要持久化。
- async/background runs：长任务不能绑定当前浏览器请求生命周期。
- worktree isolation：并行代码任务需要隔离工作树或影子目录。
- heartbeat watching / deadletter queue：长期 actor 需要活性检测和失败队列。
- scaffold mode：先渲染 prompt/artifacts 而不执行真实 worker，便于调试和测试。
- state layout：run 级目录/记录应保存 prompts、results、logs、summary、artifacts。

不直接照搬：

- pi-crew 是 terminal coding harness 扩展，不是 Web 频道生产 runtime。
- 我们不能要求用户主工作树 clean 才能聊天；worktree isolation 只应用到 coding execution lane。

### LangGraph

来源：https://docs.langchain.com/oss/javascript/langgraph/persistence

应吸收：

- checkpoint 是每个执行边界的状态快照。
- checkpoint 支持 time travel、fork、fault tolerance。
- 失败节点重试时，不应重复执行已经成功的同一 super-step 写入。

映射到 Miaochat：

- `harness_runs` 是一次 wake/run。
- `harness_steps` 是 super-step 边界。
- `state_snapshots` 是可恢复状态。
- `state_patches` 是待验证写入。
- `external_receipts` 是外部副作用去重依据。

### AutoGen Core Runtime

来源：https://microsoft.github.io/autogen/0.7.3/user-guide/core-user-guide/framework/agent-and-agent-runtime.html

应吸收：

- Agent 应由 runtime 管理生命周期，不应由应用代码临时 new 一个对象就丢掉。
- Runtime 负责通信、生命周期、安全边界、监控和调试。
- Agent 消息处理是以 message type 路由，而不是只有一条 chat completion path。

映射到 Miaochat：

- `agent_actor_sessions` 管生命周期。
- `agent_actor_mailbox_events` 管通信。
- `agent_actor_wake_runs` 管每次唤醒和执行 receipt。
- `harness_trace_events` 管可观测性。

### OpenAI Agents SDK Handoff

来源：https://openai.github.io/openai-agents-python/handoffs/

应吸收：

- Handoff 是显式机制，不是让一个 agent 在自然语言里“顺便提醒”另一个 agent。
- handoff 输入可以被过滤、裁剪、包装。
- nested handoff 的历史需要被压缩成明确摘要，避免转交时携带无限上下文。

映射到 Miaochat：

- 继续保留 `produces:<artifact_kind>` / `consumes:<artifact_kind>` 声明。
- 下一步把 handoff 输出落成 `handoff_artifact` mailbox event。
- 消费方从 mailbox 读取 handoff，不再只依赖 pinned message 注入。

### Temporal

来源：https://docs.temporal.io/develop/typescript/workflows/timers

应吸收：

- durable timer 可以支撑长时间 sleep，worker/service 恢复后继续执行。
- 用 timer + signal 建模异步业务，而不是用 Node 进程内 setInterval。

映射到 Miaochat：

- 每个 actor session 一个 Temporal workflow 或 session-keyed workflow lane。
- Heartbeat 由 durable timer 触发。
- 用户消息、handoff、tool receipt、memory review 都通过 signal/mailbox 唤醒。

## 已完成竖切片

### G7b-0: Agent Actor Runtime Contract / Domain Core

完成状态：已完成。

新增契约：

- `AgentActorRuntimeProfile`
- `AgentActorSession`
- `AgentActorMailboxEvent`
- `AgentActorHeartbeatPolicy`
- `AgentActorWakeDecision`
- `AgentActorWakeRun`
- `AgentActorHeartbeatResponse`
- `AgentActorChannelEvent`
- `AgentActorParticipant`
- `AgentActorTriggerPolicy`
- `AgentActorTurnCandidate`
- `AgentActorLoopGuardDecision`

新增领域函数：

- `sortAgentActorMailboxEvents`
- `selectAgentActorWakeDecision`
- `selectAgentActorTurnCandidates`
- `evaluateAgentActorLoopGuard`
- `createAgentActorMailboxEventFromTurnCandidate`
- `createAgentActorHeartbeatTickEvent`
- `createAgentActorWakeRun`
- `markAgentActorRunning`
- `markAgentActorIdle`
- `markAgentActorHeartbeatObserved`
- `interpretAgentActorHeartbeatResponse`
- `isAgentActorBusyStatus`

测试覆盖：

- profile namespace 隔离
- session 默认 heartbeat/checkpoint/compression 策略
- mailbox event 序列化
- wake decision 不隐含外部 commit
- heartbeat policy 非法值拒绝
- user message 优先唤醒
- handoff artifact 唤醒消费方
- sleeping/stopped session 行为
- busy skip heartbeat
- heartbeat due / not_due / quiet_window / budget_exhausted
- HEARTBEAT_OK 开头/结尾抑制
- HEARTBEAT_OK 中间不抑制
- wake run receipt
- running -> heartbeat observed -> idle 状态迁移
- human @agent 只触发被点名 agent
- agent-origin @agent 默认不触发，避免 bot cascade
- target policy 显式 opt-in 后才允许 agent-to-agent mention
- handoff event 可以跨 agent 触发 mailbox event
- role mention 通过 role tags 解析
- public channel history 可见不等于自动发言
- muted/offline/cooldown/同一对 agent ping-pong/连续无人类轮次都会被 loop guard 拦截

### G7b-0.5: Channel Interaction Scheduler Core

完成状态：已完成。

调研依据：`docs/product/miaochat_multi_agent_channel_interaction_research_2026-05-31.md`。

这一层把 “ChannelEvent -> Scheduler -> AgentTurn -> MailboxEvent” 先固化成纯 runtime 逻辑：

- `ChannelEvent` 是用户消息、agent 消息、handoff、tool result 等同频道事件的源事实。
- `AgentParticipant` 表达 agent 在频道里的角色、状态、role tags 和 trigger policy。
- `TriggerPolicy` 明确 read visibility 与 speak trigger 分离：agent 可以读取频道历史，但不因为可见就自动发言。
- `selectAgentActorTurnCandidates` 只根据 mention、role、handoff 和策略生成候选 turn。
- `evaluateAgentActorLoopGuard` 负责 cascade 防护、冷却、同一对 agent ping-pong、连续无人类轮次、链路预算。
- `createAgentActorMailboxEventFromTurnCandidate` 把允许的频道 turn 转成 actor mailbox event，供后续 Temporal actor workflow 消费。

默认策略保持保守：

- human @agent 默认可触发。
- agent @agent 默认不触发。
- agent-origin mention 只有 `botOriginatedMentionPolicy=explicit`、`same_causal_chain` 或 `handoff` 才能继续。
- muted/offline agent 不运行。
- @all-agents 默认禁用。

## 下一阶段任务拆解

### G7b-1: 持久化表

目标：把 actor runtime 从内存契约落到数据库。

新增表：

- `agent_actor_channel_events`
- `agent_actor_participants`
- `agent_actor_runtime_profiles`
- `agent_actor_sessions`
- `agent_actor_mailbox_events`
- `agent_actor_wake_runs`
- `agent_actor_heartbeat_policies`
- `agent_actor_turn_candidates`

关键字段：

- channel event：`channel_id`、`author_type`、`author_id`、`event_type`、`mentions`、`visibility`、`causal_chain_id`、`parent_event_id`
- participant：`channel_id`、`agent_id`、`role`、`role_tags`、`status`、`trigger_policy`、`read_cursor_event_id`
- profile：`workspace_id`、`agent_id`、`memory_namespace`、`session_namespace`、`skill_namespace`、`toolset_ids`、`gateway_channel_ids`
- session：`status`、`active_run_id`、`last_wake_at`、`last_heartbeat_at`、`current_state_snapshot_id`、`current_checkpoint_id`
- mailbox：`kind`、`status`、`priority`、`available_at`、`expires_at`、`dedupe_key`、`payload`、`source_agent_id`、`source_run_id`
- wake run：`decision`、`reason`、`selected_event_ids`、`model_called`、`message_emitted`、`status`

索引：

- `agent_actor_channel_events(workspace_id, channel_id, created_at)`
- `agent_actor_channel_events(causal_chain_id, created_at)`
- `agent_actor_participants(workspace_id, channel_id, agent_id)`
- `agent_actor_sessions(workspace_id, agent_id, status)`
- `agent_actor_sessions(workspace_id, conversation_id)`
- `agent_actor_mailbox_events(session_id, status, available_at, priority)`
- `agent_actor_mailbox_events(dedupe_key)` unique where not null
- `agent_actor_wake_runs(session_id, started_at)`

单测：

- repository create/list/update session
- persist channel event with parsed mentions
- list participants by channel with trigger policy
- enqueue mailbox event idempotency
- queued event ordering
- expired event ignored
- wake run written once per decision
- workspace isolation

### G7b-2: Temporal Actor Session Workflow

目标：让每个同事不是一次性 activity，而是有 durable lifecycle。

工作流语义：

```text
agentActorSessionWorkflow(sessionId)
  load session + policy
  loop:
    wait for mailbox signal or heartbeat timer
    select wake decision
    if skip: persist skipped wake run
    if wake:
      mark session running
      start harness run
      execute model/tool lane
      persist result + receipts
      mark events processed
      mark session idle
```

Temporal signal：

- `enqueueMailboxEvent`
- `stopSession`
- `sleepSession`
- `wakeNow`
- `updateHeartbeatPolicy`

Temporal query：

- `getSessionState`
- `getMailboxDepth`
- `getLastWakeRun`
- `getNextHeartbeatAt`

单测：

- signal user message wakes immediately
- heartbeat timer wakes when due
- heartbeat skipped when busy
- `stopSession` prevents future wake
- `sleepSession` ignores handoff but accepts user/manual wake
- selected event marked claimed before model call
- failure returns session to idle or blocked with trace
- duplicate signal with same `dedupeKey` does not run twice

### G7b-3: API / Worker 接入

目标：现有聊天入口不直接调一轮模型，而是向 actor mailbox 投递事件。

接入点：

- direct conversation：用户消息 -> 单个 actor mailbox `user_message`
- group conversation：用户消息 -> 被 @ 或频道成员的 actor mailbox
- handoff：producer output -> consumer mailbox `handoff_artifact`
- tool receipt：工具完成 -> source actor mailbox `tool_receipt`
- heartbeat：timer -> actor mailbox `heartbeat_tick`

API endpoint：

- `GET /api/agent-actors/sessions`
- `GET /api/agent-actors/sessions/:id`
- `GET /api/agent-actors/sessions/:id/mailbox`
- `POST /api/agent-actors/sessions/:id/wake`
- `PATCH /api/agent-actors/sessions/:id/heartbeat-policy`

单测：

- 未加入 workspace 不能读取 session
- 用户发频道消息只投递给同 workspace/channel 的 actor
- @mention 只唤醒被点名 actor
- 普通频道消息按 channel membership 唤醒可见 actor
- handoff event 不暴露为用户消息
- heartbeat-only prompt 不出现在聊天历史

### G7b-4: Heartbeat Prompt Contract

目标：心跳保持 agent 活性，但不能制造噪音或虚假推进。

Prompt contract：

- 只读取 heartbeat checklist、未处理 mailbox 摘要、最近 checkpoint 摘要。
- 不重复旧任务。
- 不猜测用户新需求。
- 没有需要注意的内容时只返回 `HEARTBEAT_OK`。
- 有 alert 时返回简短中文提醒，不附带 `HEARTBEAT_OK`。

单测：

- `target: none` 且 OK-only 不创建 assistant message
- `target: last_contact` 且 alert 创建可见消息
- OK-only 不更新 conversation `updatedAt` 为活跃聊天
- heartbeat prompt 不包含完整聊天历史 when `lightContext=true`
- heartbeat prompt 使用新 session when `isolatedSession=true`
- `activeHours` 外跳过

### G7b-5: State Snapshot / Trace / Replay

目标：每次 wake/run 可以解释、恢复、复盘。

新增或接入：

- `harness_trace_events`
- `state_snapshots`
- `state_patches`
- `external_receipts`

规则：

- run_start 必须有 snapshot。
- model_call 前必须有 prompt manifest。
- tool intent 必须先记录，再 validation，再执行。
- external write 必须有 idempotency key。
- replay 不能重复执行已有 verified receipt。

单测：

- run_start snapshot required
- model_call step reads prompt manifest pointers
- failed tool run records trace
- replay reuses verified receipt
- replay from checkpoint does not overwrite original run
- fork creates new run linked to parent snapshot

### G7b-6: Memory Governor

目标：解决共享记忆污染问题。

新增状态：

- `memory_proposals`
- `memory_reviews`
- `memory_conflicts`

规则：

- 模型只能提出 memory proposal。
- 默认不进 active long-term memory。
- 与 verified fact 冲突的 proposal 自动 quarantine。
- 只有 approved memory 进入 default prompt manifest。

单测：

- unreviewed proposal 不进入 prompt
- rejected proposal 永不进入 prompt
- approved proposal 带 source run/step
- conflict proposal 自动 quarantine
- manual review 写 trace

### G7b-7: Toolset / Skillset Runtime Policy

目标：从“同事 prompt 不同”升级为“能力边界不同”。

新增：

- `runtime_toolsets`
- `runtime_skillsets`
- `agent_actor_profile_toolsets`
- `agent_actor_profile_skills`

规则：

- Runtime 不按岗位名内置工具；工具集只来自用户配置的 `toolPolicyId`、绑定的 toolset 或用户选择的模板 seed。
- 内置编程模板只能作为可编辑 seed，不得成为调度器、权限层或 loop guard 的硬编码分支。
- 用户可以为任意非编程角色定义 role tags、toolsets、skills、memory scope 和 trigger policy。
- Heartbeat 默认不能执行高风险工具。
- Project config 不能覆盖敏感 runtime controls。

单测：

- participant 只能看到用户绑定 toolset
- heartbeat lane 禁止 local_write/external_write
- user override 不可提升风险等级
- skill progressive disclosure 只加载触发 skill

### G7b-8: Worktree / Shadow Checkpoint

目标：让任何被用户授予本地写权限的 actor 可控、可回滚。

规则：

- local_write 前必须创建 shadow checkpoint。
- 多 actor 并发写代码必须隔离工作树或 patch branch。
- failed run 可 rollback 到 checkpoint。
- successful run 输出 diff artifact，不自动改用户主分支。

单测：

- local_write without checkpoint 被拒绝
- rollback 恢复 checkpoint pointer
- 并发 actor 不共享同一 write lane
- failed verification 不 commit patch

### G7b-9: Evaluation / Deadletter

目标：长期稳定比赛演示，不靠临场手工修。

新增：

- `harness_eval_cases`
- `agent_actor_deadletters`
- `heartbeat_stale_events`

规则：

- P0/P1 runtime failure 自动生成 eval candidate。
- mailbox event 重试超过阈值进入 deadletter。
- heartbeat stale 只产生内部状态，不直接骚扰用户。

单测：

- failed wake run can create eval case
- duplicate failure grouped by fingerprint
- deadletter preserves payload and source
- stale heartbeat emits internal trace only

## 验收标准

最小验收：

- 同一频道两名 AI 同事能通过 mailbox/handoff 交互，而不是只在一轮 workflow 里被顺序调用。
- 用户定义的生产者 agent 产出的 handoff artifact 持久化并唤醒用户定义的消费者 agent。
- 消费者 agent 运行时能读取 handoff artifact、自己的 profile、相关 memory、技能和工具策略。
- Heartbeat 能保持 actor 活性，但 OK-only 不污染聊天流。
- 每次 wake/run 都有 run、step、trace、snapshot。
- 失败可看到最近 checkpoint 和原因。

比赛演示验收：

- 用户提出任意领域的复杂目标。
- 用户定义的协调/分析类 agent 输出用户配置的 artifact。
- 用户定义的执行类 agent 被 artifact 唤醒，并按自己的 tool policy 执行。
- 用户定义的检查/验证类 agent 可由 tool receipt 或 handoff artifact 唤醒。
- 用户能看到每个同事的独立状态，不是一个总 workflow 的黑盒状态。

## 本轮验证命令

```bash
pnpm --filter contracts exec vitest run test/agent-actor-runtime.spec.ts test/harness-runtime.spec.ts
pnpm --filter domain exec vitest run test/agent-actor-runtime.spec.ts test/handoff-declarations.spec.ts
```

## 后续强制验证命令

每次改 actor runtime 必跑：

```bash
pnpm --filter contracts lint
pnpm --filter contracts build
pnpm --filter contracts exec vitest run test/agent-actor-runtime.spec.ts
pnpm --filter domain lint
pnpm --filter domain build
pnpm --filter domain exec vitest run test/agent-actor-runtime.spec.ts
pnpm --filter worker exec vitest run test/agent-actor-session.workflow.spec.ts test/group-orchestrator.workflow.spec.ts
pnpm --filter api exec vitest run test/agent-actors.contract-spec.ts test/messages.contract-spec.ts
```
