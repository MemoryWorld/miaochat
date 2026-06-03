# 实施路线与验收计划

## 1. 总体路线

不要一次性重写所有 agent runtime。建议采用 strangler pattern：

```text
现有 conversation / group-orchestrator
  -> 旁路新增 ChannelEvent / AgentTurn
  -> 先 mirror 旧消息到新事件
  -> 再让新 scheduler 接管 mention / handoff
  -> 最后将 group-orchestrator 降级为一种 runtime adapter
```

## 2. Phase 0：文档与类型冻结

目标：

- 冻结术语。
- 确认 PRD 范围。
- 建立 domain 类型文件。

任务：

1. 在 `packages/domain` 增加 multi-agent harness 类型。
2. 添加纯函数：
   - `resolveMentions`
   - `selectCandidateTurns`
   - `applyLoopGuard`
   - `transitionHandoff`
3. 写 domain unit tests。

验收：

- 类型无循环依赖。
- domain tests 全过。
- 不影响现有 Web/API。

## 3. Phase 1：ChannelEvent 事件层

目标：

- 新增 ChannelEvent 表。
- 现有消息写入时 mirror 成 ChannelEvent。
- 前端仍可使用旧 messages view。

任务：

1. DB migration：`channel_events`。
2. API：`GET/POST /api/channels/:channelId/events`。
3. 将 existing conversation message 转成 event view model。
4. 旧 group-orchestrator 输出同时写入 `agent_message` event。

验收：

- 发送普通消息后能查到 ChannelEvent。
- 旧 UI 不回退。
- event stream 可订阅。

## 4. Phase 2：AgentParticipant 与 MentionResolver

目标：

- 频道中 agent 成为长期 participant。
- composer 支持 @agent / @role。

任务：

1. DB migration：`agent_participants`。
2. API：participants CRUD。
3. agent role contract seed。
4. composer autocomplete。
5. participant panel。

验收：

- 能把 TechLead、Engineer、Reviewer 添加到频道。
- @TechLead 只解析到 TechLead。
- @reviewer 解析到 reviewer role。
- muted participant 不被触发。

## 5. Phase 3：AgentTurn 与 Scheduler P0

目标：

- human mention 创建 AgentTurn。
- turn 状态可见。
- context snapshot 记录。

任务：

1. DB migration：`agent_turns`、`context_snapshots`、`causal_chains`。
2. Scheduler service。
3. AgentTurn worker。
4. ContextAssembler P0。
5. UI 显示 queued/running/completed。

验收：

- @TechLead 创建 TechLead turn。
- UI 显示 TechLead thinking。
- turn 完成后写回 agent_message。
- inspector 可查看 reason 和 context sources。

## 6. Phase 4：Typed Handoff

目标：

- agent 可通过 structured output 发起 handoff。
- target agent 自动排队。

任务：

1. DB migration：`handoffs`。
2. Agent output envelope parser。
3. Handoff state machine。
4. Handoff card UI。
5. Handoff tests。

验收：

- TechLead structured handoff 触发 Engineer。
- 普通文本 @Engineer 不触发。
- Handoff 可 accept / reject / complete。
- UI 展示 ownership。

## 7. Phase 5：LoopGuard / Budget / Pause

目标：

- 防止无限 agent-to-agent。
- 用户可暂停 causal chain。

任务：

1. LoopGuard service。
2. Causal chain controls API。
3. pause/resume/stop UI。
4. LoopGuard banner。
5. budget exceeded handling。

验收：

- 同一对 agent ping-pong 达阈值后停止。
- 写入 loop_guard_triggered event。
- 用户可 continue once。
- 用户可 summarize chain。

## 8. Phase 6：Procedural Memory P1

目标：

- 成功轨迹沉淀为可复用流程。

任务：

1. DB migration：`procedural_memories`。
2. trace summarizer。
3. memory candidate review UI。
4. memory retrieval in ContextAssembler。
5. memory success/failure tracking。

验收：

- completed chain 能生成 candidate procedural memory。
- human approval 后进入 approved。
- 下次相似任务可被检索。
- 失败后记录 failureCount。

## 9. Phase 7：Tool Plan Verification

目标：

- medium/high risk tool call 前必须 plan + validation。

任务：

1. ToolPlan 类型和表。
2. Plan verifier。
3. Approval request UI。
4. Tool call event log。
5. Re-grounding policy。

验收：

- 高风险工具必须审批。
- forbidden tool 直接拒绝。
- tool call 能追溯到 tool plan。
- 每 3 次 tool call 触发 re-grounding。

## 10. Phase 8：Trace-native Eval

目标：

- 每条 causal chain 有 trajectory metrics。

任务：

1. Metrics calculator。
2. Eval fixture runner。
3. Trace graph UI。
4. Regression dashboard。

验收：

- 能计算 turn count、handoff success、duplicate rate。
- ping-pong fixture 被判为低 utility。
- successful handoff fixture 得高分。

## 11. 关键里程碑

| 里程碑 | 交付 |
| --- | --- |
| M1 | ChannelEvent + Participant + MentionResolver |
| M2 | AgentTurn + ContextSnapshot + basic scheduler |
| M3 | Typed Handoff + UI cards |
| M4 | LoopGuard + pause/resume |
| M5 | Procedural Memory |
| M6 | Tool Plan Verification |
| M7 | Trace Eval |

## 12. 风险清单

| 风险 | 缓解 |
| --- | --- |
| 重构太大影响现有 demo | mirror 模式，旧 UI 继续可用 |
| scheduler 引入重复 turn | idempotency key + tests |
| agent 互相无限响应 | P0 强制 loop guard |
| 用户不理解为什么 agent 沉默 | UI 显示 skipped / blocked reason |
| handoff 过度复杂 | P0 只支持 request/accept/complete |
| context snapshot 太占空间 | 保存 source refs + prompt hash，preview 截断 |
| memory 污染 | candidate/quarantine/approval |
| 工具越权 | tool plan verification |

## 13. 验收 Definition of Done

P0 完成必须满足：

1. 用户在频道内 @TechLead，只有 TechLead 响应。
2. TechLead 可 typed handoff 给 Engineer。
3. Engineer 完成后 Reviewer 可 critique。
4. 同一对 agent 连续 ping-pong 达阈值后被 LoopGuard 停止。
5. 每个 agent bubble 都能打开 inspector，看触发原因和 context sources。
6. 每个 handoff 都能在 trace 中看到状态迁移。
7. 所有新增 domain 逻辑有单元测试。
8. API e2e 覆盖 event、turn、handoff、loop guard。
9. Web 测试覆盖 composer、handoff card、loop guard banner、inspector。
10. 现有 conversations e2e 与 chat experience 测试仍通过。

## 14. 建议第一批任务拆分

### Task 1：Domain types and pure functions

Owner：backend/domain
Files：

```text
packages/domain/src/multi-agent/*
packages/domain/test/*
```

### Task 2：ChannelEvent persistence

Owner：backend
Files：

```text
apps/api/src/modules/channels/*
apps/api/src/modules/channel-events/*
db/migrations/*
```

### Task 3：Mention composer and participant panel

Owner：frontend
Files：

```text
apps/web/src/features/chat/*
```

### Task 4：Scheduler service

Owner：worker/backend
Files：

```text
apps/worker/src/workflows/multi-agent-channel-scheduler.workflow.ts
apps/api/src/modules/agent-turns/*
```

### Task 5：Typed handoff

Owner：domain/backend/frontend
Files：

```text
packages/domain/src/multi-agent/handoff.ts
apps/api/src/modules/handoffs/*
apps/web/src/features/chat/handoff-card.tsx
```

### Task 6：LoopGuard and controls

Owner：domain/backend/frontend
Files：

```text
packages/domain/src/multi-agent/loop-guard.ts
apps/api/src/modules/causal-chains/*
apps/web/src/features/chat/loop-guard-banner.tsx
```

## 15. 给实现 agent 的提示词约束

实现时不要让 coding agent 大范围重写 UI。建议每个 PR 限制：

- 最多 5 个核心文件。
- 先写失败测试。
- 不删除旧 conversation path。
- 所有新事件必须有 typed schema。
- 所有 scheduler 分支必须有 unit test。
- 不允许把模型自然语言 @mention 直接变成触发。
