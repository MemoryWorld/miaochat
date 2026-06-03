# Turn Scheduler 与 Runtime 设计

## 1. 核心目标

Turn Scheduler 是 Miaochat multi-agent harness 的心脏。它决定：

- 哪个 agent 可以对哪个事件发言。
- agent 发言是否因为 human mention、handoff、reply、role mention。
- agent-to-agent 的响应链是否继续。
- 何时暂停、何时要求人类确认。
- 如何避免无限 ping-pong 和重复劳动。

## 2. 当前形态与目标形态

### 当前形态

```text
POST message
  -> group-orchestrator workflow
  -> selected agents run
  -> aggregate / write messages
  -> done
```

特征：

- 一次请求驱动。
- 多 agent 并发但缺少持续互动。
- handoff 更像 workflow 内部控制，不是频道事件的一等对象。
- 缺少每个 agent 的 read cursor 和 trigger policy。

### 目标形态

```text
ChannelEvent created
  -> Scheduler sees event
  -> candidates = MentionResolver + TriggerPolicy
  -> LoopGuard filters candidates
  -> AgentTurn queued
  -> ContextSnapshot created
  -> AgentRuntime executes
  -> produced ChannelEvents created
  -> Scheduler sees new events
```

## 3. Scheduler pipeline

```ts
export async function onChannelEventCreated(event: ChannelEvent) {
  const chain = await ensureCausalChain(event);
  const mentions = resolveMentions(event);
  const participants = await loadParticipants(event.channelId);
  const candidates = selectCandidateTurns(event, mentions, participants);
  const allowed = await applyLoopGuard(event, chain, candidates);
  const turns = await createAgentTurnsIdempotently(event, chain, allowed);
  await enqueueTurns(turns);
}
```

## 4. MentionResolver

### 4.1 支持的 mention

| 输入 | 解析结果 |
| --- | --- |
| `@TechLead` | exact agent participant |
| `@tech-lead` | exact role key 或 alias |
| `@reviewer` | role mention，可能匹配多个 participants |
| `@all-agents` | all active participants，但默认需要确认 |
| reply to agent bubble | target agent |

### 4.2 解析输出

```ts
export type ResolvedMention = {
  raw: string;
  kind: "agent" | "role" | "all_agents" | "reply_target";
  targetParticipantIds: string[];
  confidence: number;
  requiresHumanConfirmation: boolean;
};
```

### 4.3 解析规则

1. 精确 agent display name 优先。
2. agent alias 次之。
3. role key 次之。
4. 模糊匹配只允许在 UI autocomplete 中发生，后端不应模糊猜测。
5. agent-originated 文本中的 `@` 不直接触发，除非它伴随 structured handoff。

## 5. Candidate selection

```ts
export function selectCandidateTurns(
  event: ChannelEvent,
  mentions: ResolvedMention[],
  participants: AgentParticipant[],
): CandidateTurn[] {
  if (event.authorType === "human") {
    return selectFromHumanEvent(event, mentions, participants);
  }

  if (event.authorType === "agent") {
    return selectFromAgentEvent(event, mentions, participants);
  }

  if (event.type === "handoff_requested") {
    return selectFromHandoff(event, participants);
  }

  return [];
}
```

### 5.1 Human event

| 情况 | 行为 |
| --- | --- |
| human @agent | 创建该 agent turn |
| human @role | 选择 role 匹配 agent；如果多个，按 availability / workload 排序 |
| human @all-agents | 若频道 agent 数量大于 3，要求确认预算 |
| human 无 mention | 默认不触发全部 agent，可只触发 channel coordinator |

### 5.2 Agent event

| 情况 | 行为 |
| --- | --- |
| agent 普通发言包含 @agent 文本 | 不触发 |
| agent 输出 `handoff_requested` | 触发 target agent |
| agent 输出 `critique_request` | 触发 target agent，但受 ping-pong 限制 |
| agent 输出 `consensus_request` | P1 支持，P0 不做 |

## 6. Priority

```ts
export type TurnPriority =
  | "human_direct"
  | "human_role"
  | "handoff"
  | "reply"
  | "scheduled"
  | "low";
```

排序：

1. human direct mention
2. human reply to agent
3. handoff
4. human role mention
5. scheduled followup
6. agent-origin critique / consensus

## 7. LoopGuard

### 7.1 默认限制

```ts
export const defaultLoopGuardPolicy = {
  maxTurnsPerCausalChain: 8,
  maxAgentToAgentTurns: 5,
  maxConsecutiveTurnsWithoutHuman: 4,
  maxSamePairPingPong: 3,
  maxAgentTurnsPerMinutePerChannel: 6,
  duplicateOutputSimilarityThreshold: 0.92,
  botMentionPolicy: "handoff_only",
};
```

### 7.2 Guard 类型

| Guard | 触发条件 | 结果 |
| --- | --- | --- |
| `max_turns_per_chain` | chain.turnCount >= max | block new turns |
| `max_agent_to_agent_turns` | agent-origin turns 过多 | pause chain |
| `max_consecutive_without_human` | 人类长时间未介入 | summarize and ask human |
| `same_pair_ping_pong` | A/B 互相回应过多 | block pair |
| `duplicate_semantic_output` | 语义重复 | skip turn |
| `cooldown` | agent 刚发言 | delay turn |
| `muted_agent` | participant muted | skip turn |
| `budget_exceeded` | cost/token/time 超预算 | ask human |

### 7.3 LoopGuard event

当 guard 触发，写入：

```json
{
  "type": "loop_guard_triggered",
  "content": "已暂停 Engineer 与 Reviewer 的连续互相回应，因为达到 same_pair_ping_pong 限制。",
  "structuredPayload": {
    "guard": "same_pair_ping_pong",
    "causalChainId": "chain_123",
    "blockedParticipantIds": ["engineer", "reviewer"],
    "suggestedActions": ["summarize", "continue_once", "pause_chain"]
  }
}
```

## 8. AgentRuntime execution

### 8.1 状态机

```text
queued
  -> context_building
  -> running
  -> waiting_approval
  -> completed

queued
  -> skipped

running
  -> failed
  -> retryable
  -> cancelled
```

### 8.2 执行步骤

```ts
export async function runAgentTurn(turnId: string) {
  const turn = await markTurnContextBuilding(turnId);
  const snapshot = await buildContextSnapshot(turn);
  await markTurnRunning(turn.id, snapshot.id);

  const plan = await maybeGenerateToolPlan(turn, snapshot);
  if (plan.requiresApproval) {
    await requestApproval(turn, plan);
    return;
  }

  const result = await callModelRuntime(turn, snapshot);
  const events = await parseAgentOutputToEvents(result);
  await commitProducedEvents(turn, events);
  await markTurnCompleted(turn.id, events.map((event) => event.id));
}
```

## 9. Agent output contract

Agent output 不应只有 markdown 文本。P0 建议模型输出 JSON envelope，runtime 再渲染为频道 UI。

```ts
export type AgentOutputEnvelope = {
  visibleMessage: string;
  intents: Array<
    | {
        type: "handoff_request";
        targetRoleKey?: string;
        targetAgentId?: string;
        goal: string;
        acceptanceCriteria: string[];
        constraints: string[];
      }
    | {
        type: "tool_plan";
        summary: string;
        toolCalls: ProposedToolCall[];
        riskLevel: "low" | "medium" | "high";
      }
    | {
        type: "memory_candidate";
        summary: string;
        memoryType: "procedural" | "fact" | "preference";
      }
    | {
        type: "no_action";
        reason: string;
      }
  >;
};
```

### 9.1 自然语言降级

如果模型没有输出合法 envelope：

- P0：把输出作为普通 `agent_message`，不解析 @mention，不触发后续 agent。
- 写入 `system_event` 标注 `output_schema_violation`。
- UI 显示 warning icon。

## 10. Handoff execution

### 10.1 Handoff request

```ts
async function createHandoffFromAgentOutput(turn, handoffIntent) {
  assertAgentCanHandoff(turn.agentParticipantId, handoffIntent.targetRoleKey);
  const target = await resolveHandoffTarget(handoffIntent);
  const handoff = await insertHandoff({ ... });
  const event = await insertChannelEvent({
    type: "handoff_requested",
    authorType: "agent",
    authorId: turn.agentId,
    structuredPayload: { handoffId: handoff.id },
  });
  await scheduler.onChannelEventCreated(event);
}
```

### 10.2 Acceptance

P0 默认 target agent 自动接受低风险 handoff，但 UI 上仍显示 `handoff_accepted`。

P1 可支持：

- target agent 拒绝，因为不属于 role contract。
- human reassign。
- target agent request clarification。

## 11. Concurrency

### 11.1 Channel lock

每个 channel 可并发多个 turns，但同一 agent participant 同一时间只能有一个 running turn。

```text
unique running lock: channelId + agentParticipantId
```

### 11.2 Causal chain lock

同一 causal chain 中可以排队多个 turns，但写入事件时必须按 `createdAt` 和 sequence 排序。

### 11.3 Idempotency

所有 scheduler 创建 turn 必须用 idempotency key。

## 12. Failure handling

| 错误 | 处理 |
| --- | --- |
| context build failed | turn failed，写 system_event |
| model timeout | retryable failed，允许 retry |
| output schema invalid | 降级普通 message，不触发后续 |
| tool plan denied | agent receives denial event |
| handoff target missing | handoff_rejected，要求 human reassign |
| loop guard block | turn blocked_by_loop_guard |

## 13. Unit tests 必须覆盖

文件建议：

```text
packages/domain/test/mention-resolver.spec.ts
packages/domain/test/turn-scheduler.spec.ts
packages/domain/test/loop-guard.spec.ts
packages/domain/test/handoff-state-machine.spec.ts
apps/api/test/multi-agent-channel.e2e-spec.ts
```

关键测试：

1. human @agent 只创建目标 agent turn。
2. human @role 匹配 role participant。
3. agent 普通文本 @agent 不触发。
4. agent structured handoff 触发目标 agent。
5. 同一 event 重复投递不重复创建 turn。
6. maxSamePairPingPong 达到后 block。
7. muted agent 不创建 turn。
8. output schema invalid 不触发下游 agent。
9. handoff target missing 进入 rejected。
10. pause causal chain 后不再调度新 turn。
