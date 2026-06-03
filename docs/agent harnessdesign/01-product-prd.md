# Miaochat Multi-Agent Channel Harness PRD

## 1. 背景

Miaochat 当前已经具备 AI 同事、频道、工作区、模型连接、provider credential、group orchestration、handoff 等基础能力。根据当前 VSCode 中的项目文档和代码线索，现阶段多同事路径主要仍是 request/response workflow：

```text
用户在频道里输入任务
  -> worker / group-orchestrator 选择多个 agent
  -> 多个 agent 各自执行
  -> 系统写回一个或多个结果
  -> 本轮结束
```

这个形态能展示“多个 AI 同事都能参与”，但还不是一个真正的 multi-agent collaboration runtime。它缺少：

- agent 之间互相可见、互相点名、互相回应的事件机制。
- 每个 agent 的 read cursor、belief snapshot、私有记忆。
- 频道级 turn scheduler。
- typed handoff 与 ownership 迁移。
- loop guard、budget、cooldown、pause/mute。
- trace-native evaluation。
- agent-to-agent 消息的权限、安全和审计边界。

顶会论文与近期 agent harness 调研给出的方向很一致：长程 agent 的可靠性不来自“更多模型调用”，而来自显式状态、过程约束、分层记忆、受控协作和轨迹评估。

## 2. 产品目标

将 Miaochat 的多 agent 协作从“一轮任务编排”升级为“频道原生的多 agent 运行时”。

目标状态：

```text
用户在频道中提出目标
  -> Tech Lead 分析目标并提出计划
  -> Tech Lead 发出 typed handoff 给 Engineer
  -> Engineer 基于频道历史、handoff payload 和私有记忆执行
  -> Reviewer 看到 Engineer 的结果后发起 critique request
  -> Engineer 回应 Reviewer 的具体问题
  -> QA 根据最终 artifact 生成测试建议
  -> Human 随时插话、暂停、接管、批准、回滚、总结
  -> 所有事件、状态、工具调用、handoff 和记忆写入都可追踪
```

## 3. 非目标

P0 阶段不做以下内容：

- 完全自由、无限制的 agent 群聊。
- 让所有 agent 默认响应所有频道消息。
- 把 Telegram / Slack / Discord 当作 core runtime source of truth。
- 让 agent 自动执行高风险外部写操作。
- 上来就做复杂 RL 训练或自动优化 agent policy。
- 上来就支持跨 workspace 的 agent 社交网络。
- 把所有历史对话直接塞进 prompt 充当长期状态。

## 4. 用户画像

### 4.1 创业团队创始人 / 产品负责人

需求：

- 快速搭一个 AI 团队跑产品调研、竞品分析、PRD、需求拆解。
- 看懂 AI 团队为什么这么判断。
- 不希望 AI 同事之间互相重复、互相误导。

关键价值：

- 能看到每个 agent 的角色职责和发言原因。
- 能暂停、点名、切换负责人。
- 能复用上一次成功协作流程。

### 4.2 工程团队负责人

需求：

- Tech Lead、Engineer、Reviewer、QA 多角色协作。
- 每个 agent 有不同工具权限。
- 代码修改、测试、review、发布建议都有审计轨迹。

关键价值：

- typed handoff 明确 ownership。
- 工具调用前有 plan verification。
- 失败后能定位是哪一步污染状态。

### 4.3 运营 / 研究团队

需求：

- 多个 agent 分别做搜索、归纳、交叉验证、写作。
- 要防止错误知识被长期记忆固化。
- 要能追溯资料来源与引用。

关键价值：

- source provenance。
- memory quarantine。
- 多 agent 交叉验证。

## 5. 核心用户故事

### Story A：人类点名一个 agent

```text
用户：@TechLead 帮我把这个需求拆成工程任务。
系统：
  1. 写入 user_message ChannelEvent
  2. MentionResolver 解析 @TechLead
  3. TurnScheduler 生成 AgentTurn
  4. ContextAssembler 注入频道历史、TechLead role contract、相关文件、当前 causal chain
  5. TechLead 输出计划
  6. 输出写入 agent_message ChannelEvent
```

验收：

- TechLead 发言气泡显示触发原因：`human_mention`。
- run detail 能看到 ContextSnapshot。
- 没有其他 agent 自动响应，除非 TechLead typed handoff。

### Story B：agent 发起 handoff

```text
TechLead：
  我建议由 @Engineer 实现登录态修复。
  Handoff: implement_api_proxy_fix
```

系统：

1. 模型文本中如包含 @Engineer，不直接触发。
2. AgentRuntime 必须输出结构化 `handoff_requested` event。
3. LoopGuard 检查 agent-origin handoff 是否允许。
4. Engineer 的 AgentTurn reason 为 `handoff`。

验收：

- handoff 是 typed event，而不是单纯文本。
- Engineer 收到明确 handoff payload：目标、上下文、验收标准、禁止事项。
- UI 展示 ownership 从 TechLead 转给 Engineer。

### Story C：Reviewer 反驳 Engineer

```text
Reviewer：
  @Engineer 你的实现没有覆盖 cookie host mismatch 的回归测试。
```

系统：

- Reviewer 的 critique 被写入 `critique_request` 或 `agent_message`。
- Engineer 被触发，但同一 causal chain 的最大 ping-pong 次数受限。
- 如果 Engineer 连续两次未解决问题，系统要求 human decision。

验收：

- 同一对 agent 的 ping-pong 默认最多 3 次。
- 超过限制后出现 LoopGuard banner。
- 人类可选择继续、总结、暂停某个 agent。

### Story D：成功协作沉淀 procedural memory

一轮任务完成后，系统提示：

```text
这次协作产生了可复用流程：
1. 检查前端 API base URL
2. 验证 cookie host
3. 修改同源代理
4. 补 API + Web 回归测试
5. curl health check

是否保存为“登录态修复流程”？
```

验收：

- 保存前必须 human approval。
- memory 初始状态为 `candidate`。
- 下次相似任务由 TechLead 检索到该 procedural memory。
- memory 有使用次数、成功率、最近失败记录。

## 6. 功能范围

### P0

| 模块 | 功能 |
| --- | --- |
| ChannelEvent | 将用户消息、agent 消息、handoff、tool result、approval、system event 写入统一事件流 |
| AgentParticipant | agent 作为频道长期参与者，有 role contract、trigger policy、状态 |
| MentionResolver | 支持 @agent、@role、reply-to-agent |
| AgentTurn | 每次 agent 发言都是独立 turn，有触发原因和 context snapshot |
| ContextSnapshot | 保存每次 turn 的上下文来源和裁剪结果 |
| Handoff | typed handoff request / accept / complete / reject |
| LoopGuard | 限制 agent-to-agent 链式响应 |
| UI | 频道页显示 agent 发言原因、handoff、状态、pause/mute |
| Tests | domain 单元测试、scheduler 单元测试、API e2e、UI e2e |

### P1

| 模块 | 功能 |
| --- | --- |
| Procedural Memory | 成功轨迹总结、人工批准、按 agent role 分配 |
| Belief Snapshot | 每个 agent 的 read cursor 和 belief version |
| Tool Plan Verification | 工具调用前输出 plan，validator 通过后执行 |
| Trace Detail | causal chain graph、context snapshot diff、tool boundary |
| Eval | trajectory utility score、重复率、handoff 成功率 |

### P2

| 模块 | 功能 |
| --- | --- |
| Trust Score | agent message / source / tool result 的信誉分 |
| Multi-Agent Threat Detection | 异常重复、恶意 instruction、知识污染识别 |
| Auto Policy Tuning | 根据 trace 调整 trigger policy 和 role contract |
| External Adapter | Slack / Discord / Telegram 作为 mirror，不作为 source of truth |

## 7. 成功指标

### 产品指标

| 指标 | P0 目标 |
| --- | --- |
| 用户能否理解 agent 为什么发言 | 90% 以上 agent bubble 有 reason label |
| 多 agent 重复输出率 | 相比当前 group orchestration 降低 40% |
| agent-to-agent 死循环 | 0 个无限循环 |
| handoff 可追踪率 | 100% typed handoff 可在 trace 中查看 |
| 人类暂停/接管可用性 | 任意 running causal chain 可在 1 次点击内 pause |

### 工程指标

| 指标 | P0 目标 |
| --- | --- |
| AgentTurn 创建幂等 | 同一 event + agent 不重复创建 turn |
| Scheduler 单元测试覆盖 | 核心分支 90% 以上 |
| API e2e | ChannelEvent、AgentTurn、Handoff 全覆盖 |
| UI e2e | mention、handoff、loop guard、pause/mute 全覆盖 |
| Trace 保存 | 每次 AgentTurn 都有 ContextSnapshot |

## 8. 关键约束

1. 不能让 agent-originated `@all-agents` 默认触发。
2. 不能把模型自然语言中的 `@Engineer` 直接当成系统 handoff。
3. 不能让 agent 读取另一个 agent 的 private memory，除非通过明确权限和脱敏摘要。
4. 不能让 context summary 覆盖 immutable facts。
5. 不能让 memory write 直接进入 trusted memory，必须先进入 candidate/quarantine。
6. 不能让工具调用结果直接修改外部状态，必须有 candidate/commit 边界。

## 9. 术语

| 术语 | 定义 |
| --- | --- |
| ChannelEvent | 频道内所有可追踪事实和动作的统一事件 |
| AgentTurn | 某个 agent 因某事件被触发后的一次运行 |
| ContextSnapshot | AgentTurn 执行前实际注入模型的上下文快照 |
| Handoff | 一个 agent 将任务 ownership 转交给另一个 agent 的 typed event |
| CausalChain | 由一个初始事件引发的一串 agent turns 和 events |
| TriggerPolicy | agent 什么情况下可以发言 |
| RoleContract | agent 负责什么、不负责什么、何时 handoff、何时沉默 |
| ProceduralMemory | 从成功轨迹中沉淀出的可复用流程知识 |
| BeliefSnapshot | agent 在某一 turn 开始时认为的频道/任务状态 |
