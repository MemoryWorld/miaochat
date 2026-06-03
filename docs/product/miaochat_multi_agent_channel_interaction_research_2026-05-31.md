# Miaochat 多 Agent 同频道交互 Harness 调研笔记

日期：2026-05-31
目标：调研 OpenClaw、Hermes 以及社区实践中“多个 agent 在同一个频道/线程里持续互相可见、互相点名、互相回应”的实现经验，并反推 Miaochat 如何从“多 agent 并发工作流”改成“多 agent 交互 harness”。
结论先行：公开资料里，OpenClaw/Hermes 的官方主线更多是“多 agent 路由、隔离、委派、子代理、Kanban、并行专用 lane”，并不天然等于“多个 agent 在一个频道里自由对话”。真正接近我们需要的，是社区围绕 shared channel 做的几类补丁和经验：频道历史注入、mention gating、bot cascade 防护、agent 独立 profile、显式 agent-to-agent message、以及内部消息总线。

## 1. 我们要解决的问题

当前 Miaochat 成品的问题可以这样定义：

```text
用户发起任务
  -> 多个 agent 被一次性并发触发
  -> 每个 agent 各自运行
  -> 最后聚合输出
```

这个形态是“并联 workflow”，不是“多 agent 交互”。

我们真正需要的是：

```text
用户在频道里提出目标
  -> Tech Lead 先理解并提出计划
  -> Tech Lead @Software Engineer 要求实现
  -> Engineer 根据频道上下文回应、提问、执行
  -> Reviewer 看到 Engineer 的结果后提出质疑
  -> Engineer 回应 Reviewer
  -> QA 根据讨论生成测试建议
  -> 多个 agent 在同一频道事件流里形成连续互动
  -> 人类可以随时插话、点名、暂停、接管、总结
```

核心差异：

| 维度 | 当前并联 workflow | 目标同频道交互 harness |
| --- | --- | --- |
| 触发方式 | 一次用户输入触发多个 agent | 每条频道事件都可能触发下一轮 agent turn |
| agent 关系 | 彼此独立执行 | 互相可见、可点名、可回应、可反驳 |
| 上下文 | 各自拿同一份初始任务 | 每个 agent 都看到频道历史和自己的私有记忆 |
| 运行时 | fan-out / fan-in | event-driven turn scheduler |
| 结束条件 | 所有并发任务完成 | 由循环预算、mention、共识、人工停止、无可行动回应决定 |
| UI | 多个 worker 结果卡片 | 一个可追踪的群聊/频道事件流 |

## 2. OpenClaw 官方资料调研

### 2.1 Multi-agent routing：更像“隔离路由”，不是同频道群聊

OpenClaw 官方 multi-agent routing 文档的重点是：一个 Gateway 可以跑多个完全隔离的 agent，每个 agent 有自己的 workspace、state directory、session history、auth profile、model registry。Inbound message 通过 bindings 路由到正确 agent。

关键点：

| 官方能力 | 含义 | 对 Miaochat 的启发 |
| --- | --- | --- |
| 每个 agent 独立 `agentDir` | agent 有自己的 auth、model registry、session store | Miaochat 需要 agent private state，不要让所有 agent 共用一份状态 |
| bindings | 把 channel account / peer / group 路由到某个 agent | Miaochat 也需要路由，但不能只把一个频道绑定给一个 agent |
| group mentionPatterns | group chat 里通过 mention 匹配 agent | Miaochat 应内置 mention resolver |
| cross-agent QMD memory search | 某 agent 可搜索另一个 agent 的 transcript collection | Miaochat 可以支持受控的跨 agent 记忆读取 |
| per-agent sandbox/tools | 不同 agent 有不同 tool allow/deny、sandbox scope | 同频道不代表同权限，交互层和权限层必须分离 |

调研结论：OpenClaw 官方多 agent 路由解决的是“多个 agent 共存和隔离”，不是天然的“多个 agent 在同一个频道中都看到彼此并持续互动”。

### 2.2 Session tools：最接近 agent-to-agent 的官方机制

OpenClaw session tools 文档里，`sessions_send` 是最接近我们目标的官方能力：一个 agent 可以给另一个 session 发消息，并可以 fire-and-forget 或等待回复。文档还提到 agent-to-agent follow-up reply loop，agents 可以交替消息直到达到 `maxPingPongTurns` 或某方停止。

关键机制：

| 工具 | 作用 |
| --- | --- |
| `sessions_list` | 查看可见 session |
| `sessions_history` | 读取某个 session 的 transcript，且会做安全过滤、截断、脱敏 |
| `sessions_send` | 给另一个 session 发送消息，可等待回复 |
| `sessions_spawn` | 创建隔离 sub-agent session |
| `sessions_yield` | 当前 turn 结束，等待 sub-agent 后续结果 |
| `session_status` | 查看 session 状态 |

对 Miaochat 的启发：

- 我们需要一个原生的 `agent_to_agent_message`，但它应该写入频道事件流，而不只是隐藏在内部 session。
- 需要限制 ping-pong 最大轮数，否则自由交互会变成无限互相回应。
- 接收方应该知道消息来源是 agent，而不是人类用户，防止把 agent 的建议当成高优先级用户命令。
- `sessions_history` 的安全过滤非常值得借鉴：跨 agent 读取历史时，不应该把完整原始 transcript 暴露给另一个 agent。

### 2.3 Parallel specialist lanes：不要把“更多 agent”当成免费资源

OpenClaw 的 parallel specialist lanes 文档很值得看。它强调 parallelism 是稀缺资源设计问题，不是简单“多开几个 agent”。

关键约束：

| 约束 | 含义 |
| --- | --- |
| Session locks | 同一个 session 不应被多个 run 同时 mutate |
| Model capacity | 所有 visible chat runs 共用 provider 限额 |
| Tool capacity | shell、browser、network、repo 操作可能比模型更慢 |
| Context budget | 长 transcript 会让每一轮更慢、更散 |
| Ownership ambiguity | 多个 agent 做同一件事会浪费 capacity |

推荐 rollout：

1. 先定义 lane contracts：每个 agent 负责什么，不负责什么，什么时候 handoff。
2. 再加 priority / concurrency controls。
3. 最后才引入 coordinator / traffic controller。

对 Miaochat 的启发：

- “自由交互”不等于所有 agent 对每条消息都有响应权。
- 每个 agent 必须有 lane contract。
- Channel scheduler 要知道谁 owns 什么，避免 duplicate ownership。
- 如果没有 role contract，coordinator 只是在协调混乱。

### 2.4 Delegate architecture：身份、权限、审计比群聊更重要

OpenClaw delegate architecture 强调组织部署里 agent 必须有自己的身份，不应 impersonate human。Delegate 有 capability tiers、hard blocks、tool restrictions、sandbox isolation、audit trail。

对 Miaochat 的启发：

| OpenClaw delegate 概念 | Miaochat 对应 |
| --- | --- |
| agent has own identity | AI 同事在频道里应有明确身份、头像、权限 |
| standing orders | 每个 agent 的行为契约和自主边界 |
| capability tiers | 只读、草稿、代表发送、主动运行等权限等级 |
| hard blocks | 不可违反的禁止动作 |
| audit trail | 所有 agent-to-agent 与 agent-to-tool 动作可审计 |

同频道 agent 互动如果没有身份和权限边界，会很快失控。

## 3. Hermes 官方资料调研

### 3.1 Hermes multi-platform：同一个 agent 多平台，不是多个 agent 群聊

Hermes multi-platform gateway 文档强调单 gateway、多平台、上下文同步、统一 skill library。Telegram 采用 group-mention gating；Slack 处理 multi-workspace OAuth；Discord 用 processing reaction 表示 agent 正在工作。

对 Miaochat 的启发：

- 外部平台有自己的协议限制，所以不要把 Slack/Telegram/Discord 当成核心 source of truth。
- Miaochat 内部频道事件流应该是 source of truth，外部平台只是 adapter / mirror。
- mention gating 是必要模式：agent 不应默认回应群里每条消息。

### 3.2 Hermes subagents：官方更偏并行 worker，不是自由群聊

Hermes subagents 文档强调 subagents 是 fully isolated Hermes sessions，有自己的 context windows、tool access、terminal backends、Python RPC namespace。Orchestrator spawn workers，workers 返回 structured results。

这和当前 Miaochat 的“多 agent 并联工作流”很像。

它适合：

- 并行研究。
- 并发 API 测试。
- 多区域部署验证。
- 数据切片处理。

但它不是我们要的“同频道持续交互”。

### 3.3 Hermes multi-agent workflow：官方避免“不可追踪群聊”

Hermes multi-agent workflow 文档明确说：有用的答案不是“加更多 agent”，而是 isolated roles、clear artifact、verified handoff。它强调 orchestrator + focused workers、Kanban、files、tests、final summary。

这对 Miaochat 是一个提醒：

- 官方范式更偏可靠交付，不鼓励无控制群聊。
- 但用户现在明确需要更接近“agent 之间自由互动”的频道体验。
- 所以 Miaochat 要做的是“可治理的 agent 社交层”，不是完全无序 group chat。

我们可以把两者结合：

```text
自由互动层：agent 可以互相点名、讨论、追问
治理层：turn scheduler、loop guard、budget、role contract、artifact verification
```

## 4. 社区经验：真正接近同频道交互的做法

### 4.1 Hermes GitHub issue：history injection + cascade prevention

Hermes GitHub issue #14853 是最贴近我们需求的公开案例之一。用户搭了 3 个 Hermes instances，每个有独立 profile、persona、model，并放在同一个 Discord channel。痛点是：agents 在 shared channel 里看不到彼此消息，协作 impossible；如果允许看所有 bot message，又会 infinite loop。

他们的方案：

| 机制 | 作用 |
| --- | --- |
| Channel History Injection | 在 agent 当前 turn 之前拉取最近 N 条 Discord channel history 注入 prompt |
| `DISCORD_CHANNEL_HISTORY_SIZE=50` | 控制注入历史量 |
| `DISCORD_REQUIRE_MENTION=true` | agent 只有被 mention 才回应 |
| `DISCORD_ALLOW_BOTS=mentions` | 只处理 bot message 中 mention 到自己的部分 |
| SOUL.md 禁止 agent 输出 `@` | 避免 agent 生成的 mention 意外触发其他 bot |
| Proposed `bot_mentions_trigger:false` | 希望 gateway 层过滤 bot-originated mentions |

这个 issue 的核心启发：

- “看见历史”和“触发发言”必须分离。
- Agent 应该能读取频道上下文，但不能因为看到上下文就自动说话。
- Bot-to-bot mention 是高危触发源，必须有 gateway-level cascade prevention。

### 4.2 Hermes community plugin：multi-agent-context

社区插件 `multi-agent-context` 的 README 说得非常直接：Hermes 内置 config 里，`require_mention=true` 会让 agent 只看见被 tag 的单条消息，变成“聋”；`trigger=all` 会让 agent 看见每条消息，但会无限互相回复，变成“停不下来”。插件给出的中间道路是：注入频道历史，但仍然只在 mention / trigger 条件满足时说话。

插件机制：

1. 在 agent 调 LLM 前的 hook 中读取当前 Discord channel/thread 最近 N 条消息。
2. 格式化为 recent history block。
3. 注入当前 turn context。
4. 维持原有 mention trigger，不让 agent 自动响应所有消息。
5. 过滤 agent 自己的消息，避免 echo chamber。
6. 缓存 10 秒，处理 Discord rate limit。
7. 清洗 Discord mention 格式。

对 Miaochat 的启发：

- 这不应该是插件，而应该是 Miaochat 原生核心能力。
- 每个 agent 的 context assembler 应该默认支持 shared channel recent history。
- 每个 agent 应该有自己的 read cursor 和 speak trigger。
- self-filtering、mention sanitization、rate limit、history count 都应该是配置项。

### 4.3 Telegram 限制：不能把外部 IM 当核心架构

Telegram 官方 Bot FAQ 说明：为避免 bot 陷入循环，bot 不会看到其他 bot 的消息，不论模式如何。

社区讨论也反复提到：把多个 bot 放进 Telegram group，用户能和它们说话，但 bot 之间看不到彼此消息。

对 Miaochat 的启发：

- 如果核心目标是 agent 之间互相交流，不要依赖 Telegram 这种外部平台机制。
- Miaochat 必须有自己的内部 event log。
- Telegram / Slack / Discord 只能作为输入输出 adapter，不能作为唯一 channel state。

### 4.4 社区常见替代通道

社区里出现了多种“让 agent 交流”的变通方式：

| 方式 | 优点 | 缺点 |
| --- | --- | --- |
| GitHub / GitLab Issues | 可追踪、异步、天然任务化 | 不像实时群聊 |
| Matrix / XMPP / self-hosted IM | 可控、可让 bot 互相读消息 | 运维复杂 |
| IMAP / Email | 异步、持久 | 延迟高，结构差 |
| Discord shared channel + history injection | 接近群聊体验 | 要防 cascade、rate limit、mention 触发 |
| Hermes Kanban | 可审计、持久 | 社区反馈执行模型偏重、human-in-loop 感弱 |
| OpenClaw sessions_send | 原生 agent-to-agent | 更像 session message，不一定可见于人类频道 |

## 5. 调研结论：Miaochat 应该走的路

Miaochat 不应该照搬 OpenClaw / Hermes 的并行 worker 模式，也不应该把 Discord/Telegram 当真正的运行基础。我们应该做一个内部原生的 multi-agent channel harness。

核心原则：

| 原则 | 解释 |
| --- | --- |
| 内部频道事件流是 source of truth | 所有用户消息、agent 消息、tool result、mention、reaction、approval 都写入统一 event log |
| read visibility 与 speak trigger 分离 | agent 可以看见历史，但只有在策略允许时才发言 |
| 每个 agent 是长期 participant | agent 有 profile、private memory、tool scope、read cursor、presence |
| 每个发言都是 turn | agent output 不是一次 workflow result，而是频道事件，会触发后续可能 turn |
| mention 是主要路由机制 | @agent、@role、@all-agents、reply-to-agent 都进入 turn scheduler |
| bot-origin mention 需要特殊策略 | agent 生成的 @ 不应默认触发无限链式反应 |
| loop guard 是核心能力 | 最大深度、最大 agent turns、冷却、预算、重复检测、human checkpoint |
| 自由交互必须可治理 | 允许 agent 互相问答，但每一步都可追踪、暂停、审计 |

## 6. Miaochat 目标架构

```text
Miaochat Multi-Agent Channel Harness
├── Channel Event Log
│   ├── user_message
│   ├── agent_message
│   ├── agent_mention
│   ├── tool_call
│   ├── tool_result
│   ├── approval_request
│   ├── reaction
│   ├── handoff
│   └── system_event
├── Agent Participants
│   ├── role contract
│   ├── private memory
│   ├── tool policy
│   ├── channel subscriptions
│   ├── read cursor
│   └── presence/status
├── Turn Scheduler
│   ├── mention resolver
│   ├── candidate agent selection
│   ├── priority and cooldown
│   ├── loop guard
│   ├── budget manager
│   └── causal chain tracker
├── Context Assembler
│   ├── recent channel history
│   ├── relevant thread summary
│   ├── agent private memory
│   ├── role contract
│   ├── tool instructions
│   └── current causal chain
├── A2A Messaging
│   ├── public channel mention
│   ├── private agent note
│   ├── handoff request
│   ├── critique request
│   └── consensus request
└── Governance
    ├── per-agent permissions
    ├── human approval
    ├── audit trail
    ├── stop / pause / mute
    └── replay / debug
```

## 7. 关键数据模型草案

```ts
type ChannelEvent = {
  id: string;
  channelId: string;
  workspaceId: string;
  causalChainId?: string;
  parentEventId?: string;
  author: {
    type: "human" | "agent" | "system";
    id: string;
  };
  type:
    | "user_message"
    | "agent_message"
    | "agent_mention"
    | "tool_call"
    | "tool_result"
    | "approval_request"
    | "reaction"
    | "handoff"
    | "system_event";
  content: string;
  mentions: AgentMention[];
  visibility: "public" | "agent_private" | "system_private";
  createdAt: string;
};

type AgentParticipant = {
  id: string;
  workspaceId: string;
  channelId: string;
  displayName: string;
  role: string;
  contract: {
    owns: string[];
    doesNotOwn: string[];
    mustAskBefore: string[];
    stopConditions: string[];
  };
  triggerPolicy: TriggerPolicy;
  toolPolicyId: string;
  memoryScope: "private" | "channel" | "workspace";
  status: "available" | "thinking" | "waiting" | "muted" | "offline";
};

type TriggerPolicy = {
  respondToHumanMentions: boolean;
  respondToAgentMentions: boolean;
  respondToRoleMentions: boolean;
  respondToAllAgents: boolean;
  allowBotOriginatedMentions: "never" | "same_causal_chain" | "explicit";
  cooldownSeconds: number;
  maxTurnsPerCausalChain: number;
};

type AgentTurn = {
  id: string;
  channelId: string;
  agentId: string;
  triggeringEventId: string;
  causalChainId: string;
  status: "queued" | "running" | "completed" | "skipped" | "failed" | "blocked";
  reason:
    | "human_mention"
    | "agent_mention"
    | "role_match"
    | "handoff"
    | "scheduler"
    | "manual";
  contextSnapshotId: string;
  budget: {
    maxTokens: number;
    maxToolCalls: number;
    maxWallTimeMs: number;
  };
};
```

## 8. Turn Scheduler 设计

### 8.1 基本流程

```text
1. 新 ChannelEvent 写入 event log
2. MentionResolver 解析 @agent、@role、reply target
3. Scheduler 生成候选 AgentTurn
4. LoopGuard 检查：
   - 是否超过 causal chain 最大轮数
   - 是否 agent 互相 ping-pong 太多
   - 是否 bot-origin mention 被策略禁止
   - 是否重复输出
   - 是否超预算
5. ContextAssembler 给每个 turn 注入：
   - 最近频道历史
   - 当前 causal chain 摘要
   - 被 reply 的 message
   - agent private memory
   - role contract
6. Agent 运行并产生 ChannelEvent
7. 新事件可能继续触发下一轮
```

### 8.2 触发规则建议

| 触发类型 | 是否默认启用 | 说明 |
| --- | --- | --- |
| Human @agent | 是 | 人类明确点名，最高优先级 |
| Human @role | 是 | 例如 @reviewer，由 scheduler 选一个或多个 |
| Human @all-agents | 可选 | 高成本，需预算提示 |
| Agent @agent | 默认受限 | 允许，但必须有 causal chain budget |
| Agent @role | 默认受限 | 防止 agent 乱喊一群 |
| Agent @all-agents | 默认禁用 | 极易爆炸 |
| Reply to agent | 是 | 对被回复 agent 触发上下文补充 |
| Keyword interest | 初期禁用 | 容易误触发 |

### 8.3 LoopGuard

必须内置这些 stop condition：

| Guard | 建议默认 |
| --- | --- |
| maxTurnsPerCausalChain | 8 |
| maxAgentToAgentTurns | 5 |
| maxConsecutiveTurnsWithoutHuman | 4 |
| maxSamePairPingPong | 3 |
| duplicateSemanticOutputThreshold | 高相似度则停止 |
| cooldownSeconds | 10-30 秒 |
| budgetExceededAction | 总结并请求人类确认 |
| botMentionPolicy | bot-origin mention 默认不触发，除非显式 handoff |

## 9. UI 应该怎么改

### 9.1 频道页

频道页应该从“任务输出流”变成真正的 multi-agent room：

| UI 元素 | 功能 |
| --- | --- |
| 参与者栏 | 显示 agent 在线、thinking、muted、tool scope |
| Mention composer | 支持 @agent、@role、@all-agents |
| Agent turn bubble | 显示 agent 为什么发言：human mention、handoff、review request |
| Causal chain view | 点击一条讨论，看它引发了哪些 agent turns |
| Loop guard banner | 当系统停止 agent 互相回应时解释原因 |
| Pause / mute | 人类可暂停某个 agent 或整个频道 agent 自动响应 |
| Ask next | 人类可手动让某个 agent 接着回应 |
| Summarize thread | 把一段 agent 讨论压缩成共享上下文 |

### 9.2 Agent 设置

每个 Agent 需要多一组“频道交互设置”：

- 可被哪些人/agent mention。
- 是否允许回应 agent-originated mentions。
- 默认是否监听频道历史。
- 最近历史注入条数。
- 是否需要 human approval 才能调用工具。
- 什么时候必须沉默。
- 什么时候必须 handoff。

## 10. MVP 实施路线

### Phase 1：内部频道 event log

目标：先摆脱外部平台限制。

- 所有消息写入 `ChannelEvent`。
- agent 消息和用户消息同等进入 event log。
- 每个 event 解析 mentions。
- 只支持人类 @agent 触发 agent。
- agent 可以读取最近 N 条频道历史。

### Phase 2：多个 agent 作为频道参与者

目标：从 workflow worker 变成 long-lived participant。

- Agent 有 channel membership。
- Agent 有 read cursor。
- Agent 有 private memory。
- Agent 有 trigger policy。
- UI 显示 agent presence。

### Phase 3：Agent-to-agent mention

目标：允许 agent 互相点名。

- Agent 输出中的 @agent 进入 scheduler。
- bot-origin mention 默认进入“待确认/受限队列”。
- 支持 `handoff` action：agent 明确把问题交给另一个 agent。
- LoopGuard 控制最大轮数。

### Phase 4：可治理的自由讨论

目标：让多个 agent 像一个受控团队一样讨论。

- 支持 @role。
- 支持 consensus request。
- 支持 critique request。
- 支持 thread summary。
- 支持人类暂停、恢复、跳过、终止 causal chain。

### Phase 5：外部平台 adapter

目标：把内部频道镜像到 Discord/Slack/Telegram。

- Discord：可使用 history backfill + mention gating 模型。
- Telegram：不要依赖 bot-to-bot 可见性，必须由 Miaochat 内部 event bus 转发。
- Slack：优先做 coordinator / thread summary，不承诺 true visible broadcast，除非 adapter 验证通过。

## 11. 测试用例

| 测试 | 预期 |
| --- | --- |
| 人类 @TechLead 提出需求 | 只有 TechLead 首先回应 |
| TechLead @Engineer 请求实现 | Engineer 看到 TechLead 的上文并回应 |
| Engineer @Reviewer 请求评审 | Reviewer 看到 Engineer 的方案和前文 |
| Reviewer 提出问题但不 @Engineer | Engineer 不应自动无限回应，除非策略允许 |
| Agent A 生成 @Agent B | 若 bot-origin mention policy 为 explicit，则进入调度但受 LoopGuard 控制 |
| Agent A/B 互相 ping-pong | 超过 maxSamePairPingPong 后停止并总结 |
| @all-agents | 弹出成本和轮数提示，按预算触发 |
| Telegram adapter | bot messages 由内部 event bus 注入，不依赖 Telegram bot 读取 bot |
| Discord adapter | history injection 不应触发自动全员响应 |
| muted agent | 即使被 mention 也不运行，显示 skipped reason |

## 12. 这轮调研对 Miaochat 的核心判断

1. 你现在不满意“多 agent 并联 workflow”是对的，因为那不是 agent social interaction。
2. OpenClaw 官方的多 agent 路由和 Hermes 官方 subagents/Kanban 都有价值，但它们更偏“任务委派/隔离/并行”，不完全等于同频道互相交互。
3. 公开经验里真正接近需求的是：频道历史注入 + mention gating + cascade prevention。
4. Miaochat 的机会是把这些社区补丁做成原生 harness：shared event log、agent participants、turn scheduler、loop guard、context assembler。
5. 外部平台不能作为核心 truth，因为 Telegram 明确不让 bot 看 bot，Slack/Discord 也有各自限制；Miaochat 必须自己拥有内部频道事件流。
6. “自由交互”不是无限自由，而是 policy-governed interaction：可见、可点名、可回应，但有预算、冷却、最大轮数、权限和人类接管。

## 13. 下一步建议

下一步应该不是继续加 workflow 节点，而是重构运行模型：

```text
从：
TaskRun -> parallel AgentRuns -> aggregate

改成：
ChannelEvent -> Scheduler -> AgentTurn -> ChannelEvent -> Scheduler -> ...
```

最小可行版本只做一件事：在 Miaochat 内部频道里，让两个 agent 能基于同一段频道历史，通过 @mention 互相回应 3-5 轮，并且不会无限循环。

如果这个打通了，Miaochat 才真正开始接近“Agent Harness for multi-agent interaction”，而不是“多 agent 并发工作流 UI”。
