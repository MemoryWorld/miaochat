# Phase G: 长程协作 Agent Harness

## 目标

把 Miaochat 的 AI 同事从“把用户消息直接转发给模型 API”提升为可持续演进的 Agent Harness：

- 每个 AI 同事必须带着自己的职责、范围、输出风格和协作护栏进入真实模型调用。
- 频道里的多名 AI 同事必须能围绕同一个程序设计问题分别响应，而不是输出一条无身份的聚合文本。
- 长程任务必须沉淀计划、交接、验证和失败原因，让下一轮同事可以接着做。
- UI 必须让用户感觉自己在使用协作工作区，而不是静态聊天框。

## 资料来源与共识

### 公开资料

- OpenAI Harness Engineering: https://openai.com/index/harness-engineering/
  - 关键结论：仓库内文档、执行计划、决策日志要成为 agent 可读的系统事实来源；复杂工作要用版本化计划承载，而不是依赖外部聊天或人的记忆。
- OpenAI Agents SDK harness/sandbox: https://openai.com/index/the-next-evolution-of-the-agents-sdk/
  - 关键结论：可靠 agent 不只需要模型，还需要工具、记忆、沙箱、文件系统、指令和可控运行环境。
- OpenAI Practical Guide to Building Agents: https://cdn.openai.com/business-guides-and-resources/a-practical-guide-to-building-agents.pdf
  - 关键结论：agent 的基础由模型、工具、指令/护栏构成；要能识别完成、失败时停下并交还用户。
- Anthropic long-running harness: https://www.anthropic.com/engineering/harness-design-long-running-apps
  - 关键结论：长程 coding agent 需要任务拆分、结构化交接、planner/generator/evaluator 分离，避免上下文焦虑和自我评价过宽。
- Anthropic effective harnesses: https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents
  - 关键结论：initializer/coding agent 与跨会话工件可以让 agent 跨上下文窗口持续推进。
- Anthropic multi-agent research system: https://www.anthropic.com/engineering/multi-agent-research-system
  - 关键结论：lead agent 分解任务，subagents 并行探索，适用于多方向、重工具、超单上下文窗口的问题。
- 菜鸟教程 Harness Engineering: https://www.runoob.com/ai-agent/harness-engineering.html
  - 关键结论：Harness 的核心是约束、反馈回路、上下文工程、熵管理；失败不是换模型，而是补运行环境。

### 本地 openclaw / hermes 抽象

- OpenClaw 可借鉴点：
  - ACP bridge 把外部 IDE session 映射到 Gateway session。
  - 会话 key 可以绑定具体 agent，支持 reconnect/reset/cancel。
  - Gateway 负责持久化 session，桥接层只做协议翻译。
  - 工具流事件、usage/session info 通过统一事件回传。
- Hermes 可借鉴点：
  - profile 隔离：每个实例拥有独立 config、memory、sessions、skills。
  - gateway 多平台入口：一个 agent runtime 可以接 CLI、Telegram、Slack 等通道。
  - toolsets/skills/memory/checkpoint/trajectory compression 是 harness 的核心资产。
  - shadow git checkpoint 在写文件前透明快照，失败后可回滚。
  - trajectory compression 保护首尾关键 turns，中段压缩为结构化摘要。
- 不使用项：
  - `claude-code-main/` 被视为不可上传、不可复用的本地敏感参考目录。本阶段不读取、不复制其实现。

## 当前差距

- 自定义 AI 同事的 `systemPrompt` 已存入数据库，但 DeepSeek 真实调用没有使用它。
- 所有同事接近同一模型调用，缺少 role-specific instructions、handoff artifact、evaluator 反馈。
- 真实流式事件仍是 worker 完成后由 API 发布，尚未做到 worker activity 逐 token 推送。
- 工具权限、沙箱、文件系统检查点、可恢复长程任务还没有形成产品级闭环。
- 频道附件按钮仍是浏览器默认 input 样式，不符合当前 UI。

## Phase G 任务列表

### G1: 角色指令进入真实模型调用

- [x] API 查询 conversation agents 时带上 custom agent 的职责、范围、输出风格。
- [x] worker dispatch 时构造中文协作 harness instructions。
- [x] DeepSeek/OpenAI-compatible prompt messages 支持 system instructions。
- [x] direct/group 路径都使用同一套 harness instructions。

验收：

- [x] 单元测试覆盖 prompt message 顺序。
- [x] worker 测试覆盖 direct/group harness instructions。

### G2: 长程协作输出护栏

- [x] 每名 AI 同事输出时必须说明“目标判断、拆解、自己的建议、需要协作、风险与验证”。
- [x] 对复杂程序设计问题要求生成可交接的结构化结果，而不是只给一句回答。
- [x] 不暴露底层 provider 名称，只使用“AI 同事”语言。

验收：

- [x] helper 测试断言输出结构存在。

### G3: 多同事三题回归

- [x] 在集成测试中提出三个方向的程序设计问题。
- [x] 每个问题必须由多名 AI 同事分别回复并持久化。
- [x] 验证 `sourceAgentId` 排异，确保不是一条无身份聚合回复。

三题：

- 长程任务的上下文交接怎么设计？
- 工具执行权限和失败回滚怎么设计？
- 多 Agent 评审闭环怎么设计？

### G4: 附件按钮视觉统一

- [x] 移除浏览器默认文件选择按钮的突兀样式。
- [x] 改为与当前胶囊/卡片一致的按钮。
- [x] 保留键盘和屏幕阅读器可访问性。

### G5: 后续未完成项

- [ ] worker activity 直接向 StreamBroker 发布实时 token，而不是完成后批量回放。
- [ ] sandbox manifest：每个长程任务明确输入目录、输出目录、工具权限和凭证隔离。
- [ ] shadow checkpoint：文件写入/补丁执行前快照，失败可回滚。
- [ ] handoff artifact 持久化：每轮执行产生 `plan.md`、`handoff.md`、`verification.md`。
- [ ] evaluator agent：把评审/QA 从生成者中拆出来，形成 planner/generator/evaluator 闭环。
- [ ] doc-gardening agent：扫描文档与实现漂移，生成修复任务。

## State-Aware Harness 升级包计划

依据：`docs/product/agent_harness_state_aware_runtime_update_2026-05-31.md`。本升级包把 Phase G 从“长程协作 prompt + 多同事回复”推进到 “Run + Step + State + Commit Boundary” 的可演进 runtime。范围只覆盖 harness/runtime，不扩展新的聊天 UI 或非 harness 产品功能。

### G6: State-Aware 指令与 prompt manifest 竖切片

**目标：** 让每次 direct/group/internal Agent 调用都带上同一个状态感知执行上下文。

- [x] 定义 `HarnessRun`、`HarnessStep`、`StatePointer`、`PromptManifest`、`StatePatch`、`ToolCallIntent`、`ExternalReceipt` 的前端/后端共享合约。
- [x] worker 为每次 Agent 调用生成唯一 `harnessRunId`、`run_start` snapshot 和 safe checkpoint。
- [x] prompt manifest 明确本次读取的 workspace、channel、agent、run、pinned context 状态。
- [x] 指令层明确 candidate / validation / approval / commit 隔离，禁止模型声称已经提交外部副作用。
- [x] direct、group、internal runtime 三条路径都使用同一套 state-aware harness 指令。

验收：

- [x] contracts 测试覆盖 state-aware harness schema。
- [x] worker 测试覆盖 direct/group/internal 的 `harnessRunId` 传递和 state-aware instruction。

### G7: Run + Step + Trace 持久化 MVP

**目标：** 每个 Agent 行为都有可查询的 run、step、trace 和当前 state pointer。

- [ ] 新增 `harness_runs`、`harness_steps`、`harness_trace_events`、`state_snapshots` 表。
- [ ] direct/group/internal activity 创建 `HarnessRun`，并记录 `context_build`、`model_call`、`final_output` steps。
- [ ] 模型调用前保存 prompt manifest，step 记录 `reads` 和空 `writes`。
- [ ] API 增加只读 `GET /api/harness/runs`、`GET /api/harness/runs/:runId`、`GET /api/harness/runs/:runId/steps`。

验收：

- [ ] 单聊和群聊都会写入 run/step/trace/snapshot。
- [ ] 失败时 run 展示最近 safe checkpoint。

### G7a: 声明式同频道 Handoff 调度

**目标：** 解决同一频道内多名 AI 同事同轮看不到彼此输出的问题，同时避免把任何固定岗位链路写死进 workflow。

- [x] `capabilityTags` 支持通用声明：`produces:<artifact_kind>` 和 `consumes:<artifact_kind>`。
- [x] API 查询频道同事时把 `custom_agents.capability_tags` 传给 worker target。
- [x] group orchestrator 根据声明动态分波：无依赖的同事并行执行，消费某类 artifact 的同事等待对应 producer 成功产出后执行。
- [x] 上一波 producer 的输出以“共享交接上下文”注入下一波 prompt context，作为协作数据而非系统指令。
- [x] 没有声明或依赖无法满足时保持原有并行/降级行为，避免死锁。

验收：

- [x] domain 单测覆盖 `produces:/consumes:` 解析、producer-before-consumer 和无 producer 降级。
- [x] worker 单测覆盖 capability handoff 调度、前一波输出注入后一波上下文。

### G7b: Agent Actor Runtime 核心机制

**目标：** 把 AI 同事从一次性 workflow 调用推进到可持久化、可唤醒、可审计的 actor runtime。依据：`docs/product/agent_actor_runtime_next_stage_plan_2026-05-31.md`。

- [x] 吸收 Hermes 的 profile/toolset/skill/memory/checkpoint/delegation 机制，明确不直接替换 Miaochat runtime。
- [x] 吸收 OpenClaw heartbeat 的主会话心跳、`HEARTBEAT_OK` 响应契约、`skipWhenBusy`、`lightContext`、`isolatedSession` 和 `activeHours`。
- [x] 定义 `AgentActorRuntimeProfile`、`AgentActorSession`、`AgentActorMailboxEvent`、`AgentActorHeartbeatPolicy`、`AgentActorWakeDecision`、`AgentActorWakeRun` 共享合约。
- [x] 新增 domain 纯函数：mailbox 排序、wake decision、heartbeat tick、wake run receipt、session 状态迁移、`HEARTBEAT_OK` 抑制。
- [x] 单测覆盖 profile/session/mailbox/heartbeat/wake/预算/状态迁移/ack 抑制。
- [x] 根据 `docs/product/miaochat_multi_agent_channel_interaction_research_2026-05-31.md` 增加 `ChannelEvent`、`AgentParticipant`、`TriggerPolicy`、`TurnCandidate`、`LoopGuardDecision` 合约。
- [x] 新增 ChannelEvent -> TurnCandidate -> MailboxEvent 纯函数桥，支持 human mention、agent mention opt-in、role mention、handoff 和 dedupe key。
- [x] 新增 loop guard：muted/offline、cooldown、同一对 agent ping-pong、连续无人类轮次、agent-to-agent 预算、causal chain 预算。
- [x] 单测覆盖 “看见历史不等于发言”、agent-origin mention 默认阻断、显式 opt-in、handoff 触发、role tags、cascade 防护。
- [x] `AgentParticipant` 暴露用户自定义的 `behaviorRef`、`toolPolicyId`、`memoryScope`、`templateId`；runtime 不按软件工程师等岗位名分支。
- [ ] 新增 `agent_actor_runtime_profiles`、`agent_actor_sessions`、`agent_actor_mailbox_events`、`agent_actor_wake_runs` 数据表。
- [ ] 新增 `agent_actor_channel_events`、`agent_actor_participants`、`agent_actor_turn_candidates` 数据表。
- [ ] 新增 Temporal `agentActorSessionWorkflow`，由 mailbox signal 和 durable heartbeat timer 驱动。
- [ ] direct/group/handoff/tool receipt 入口改为投递 mailbox event，再由 actor runtime 唤醒。
- [ ] heartbeat prompt contract 接入 worker harness instructions，OK-only 不创建聊天消息。
- [ ] handoff artifact 持久化为 mailbox event，消费方从 mailbox 读取而不是只靠 pinned context。

验收：

- [x] `pnpm --filter contracts exec vitest run test/agent-actor-runtime.spec.ts test/harness-runtime.spec.ts`
- [x] `pnpm --filter domain exec vitest run test/agent-actor-runtime.spec.ts test/handoff-declarations.spec.ts`
- [x] human @agent 只触发被点名 agent，agent @agent 默认不触发。
- [x] agent-to-agent opt-in 和 handoff 均能转成 mailbox event。
- [x] muted/offline/cooldown/ping-pong/no-human-checkpoint 均有 loop guard skip reason。
- [ ] 同频道用户定义的生产者 agent 产出 handoff artifact 后，用户定义的消费者 agent 在独立 wake run 中读取该 artifact。
- [ ] heartbeat OK-only 在 UI/消息历史中不可见，但 trace/wake run 可审计。

### G8: Candidate / Commit 隔离 MVP

**目标：** 模型只能提出候选动作，不能直接提交状态或工具副作用。

- [ ] 新增 `state_patches`、`tool_call_intents`、`external_receipts` 表。
- [ ] 所有工具动作先写 `ToolCallIntent(proposed)`。
- [ ] schema validation、policy validation 通过后才能进入 execution。
- [ ] `StatePatch` 只有 validation passed 后才能 committed。
- [ ] memory 写入改为 `MemoryProposal`，默认不进入 long-term active memory。

验收：

- [ ] 未验证 hypothesis 不会进入 memory/context。
- [ ] rejected intent/patch 有 trace event 和中文失败原因。

### G9: Risk / Approval / Receipt 闭环

**目标：** 高风险外部动作提交前中断，提交后有 receipt。

- [ ] Capability Registry 为工具补充 `riskLevel`、`approvalPolicy`、`idempotencyRequired`。
- [ ] read-only 工具可自动执行，local_write/external_write 进入审批策略。
- [ ] external_write 必须产生 `ApprovalRequest`，批准后才能 execute。
- [ ] 外部写动作必须保存 idempotency key、receipt、verify status 和 compensation note。

验收：

- [ ] external_write 没有 approval/receipt 时不能标记 committed。
- [ ] rejection 会回到 safe checkpoint 重新规划。

### G10: Checkpoint / Recovery / Eval 闭环

**目标：** 失败可定位、可 fork、可回归。

- [ ] 支持 run_start、before_external_write、after_receipt checkpoint。
- [ ] replay/fork 创建新 run，不覆盖历史 run。
- [ ] failed run 可一键创建 eval case。
- [ ] eval 覆盖 outcome、process、state integrity、side effect 四类结果。

验收：

- [ ] replay 不重复执行已提交外部副作用。
- [ ] 每个 P0/P1 harness failure 都能进入 regression suite。

### G11: Memory Governor 和污染隔离

**目标：** 长期记忆不被模型推测污染。

- [ ] memory proposal queue 支持 approve/reject/quarantine。
- [ ] conflict detection 标出与已验证 fact 冲突的 proposal。
- [ ] Context Builder 默认过滤 quarantined memory 和 unverified hypothesis。
- [ ] Memory Review 页面只展示可审计来源、source run/step 和 review decision。

验收：

- [ ] quarantined memory 不进入默认 prompt manifest。
- [ ] manual review 决策写入 trace，并能追溯到 source step。

## 验证命令

- `pnpm --filter agent-adapters exec vitest run test/deepseek-adapter.spec.ts`
- `pnpm --filter contracts exec vitest run test/harness-runtime.spec.ts`
- `pnpm --filter worker exec vitest run test/agent-harness-instructions.spec.ts test/group-orchestrator.workflow.spec.ts test/single-agent.workflow.spec.ts test/internal-runtime-agent.workflow.spec.ts`
- `pnpm exec vitest run tests/integration/group-orchestrator.spec.ts`
- `pnpm --filter web exec vitest run --config vitest.config.ts src/features/chat/chat-composer.spec.tsx src/features/channels/channel-shell.spec.tsx`
- `pnpm --filter web lint`
- `pnpm --filter web build`
- `pnpm --filter worker lint`
- `pnpm --filter worker build`

## 本轮执行记录

- 已完成 G1-G4 的第一条可运行竖切片：自定义 AI 同事画像进入真实模型调用、长程协作输出护栏、多同事三题回归、附件按钮视觉统一。
- 已完成 G6 的 state-aware harness 指令竖切片：新增共享合约，direct/group/internal runtime 均携带 `harnessRunId`、run_start snapshot、safe checkpoint 和 prompt manifest，模型输出被明确限制为 candidate/proposal。
- 额外修复消息读取权限边界：从未加入频道的用户读取消息返回 404；曾加入后被移除的用户仍返回 403，避免泄露未知频道存在性同时保留移除态反馈。
- 验证通过：DeepSeek adapter 单测、worker harness/workflow 单测、web chat/channel 单测、group orchestrator 集成测试、messages/channel collaboration API 测试、api/worker/web/domain/sdk/adapters/contracts 构建。
- 已知非本轮阻塞：`api lint` 仍有 11 个既有 lint 错误；`contracts lint` 仍有 1 个既有 lint 错误。当前改动涉及的新增/修改文件已通过 `git diff --check`、构建和相关测试。

## 风险

- 真实 DeepSeek 网络波动仍可能导致某个同事失败；当前已能部分成功并给中文失败提示。
- 长程 harness 的核心护城河不是 prompt，而是可恢复执行、工具沙箱、检查点、评审闭环。本阶段只完成第一层竖切片。
- 多 Agent 并行会增加 token 成本，后续需要引入预算、超时和任务价值判断。
