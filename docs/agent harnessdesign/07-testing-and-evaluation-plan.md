# 测试与评估计划

## 1. 测试目标

这次重构的风险点不在 UI，而在运行时语义。因此测试必须覆盖：

- 事件写入。
- mention 解析。
- turn 调度。
- handoff 状态机。
- loop guard。
- context snapshot。
- permission / tool plan。
- UI 与 API 的一致性。
- 轨迹评估。

## 2. 测试分层

```text
Domain unit tests
  -> Scheduler unit tests
  -> Runtime integration tests
  -> API e2e tests
  -> Web component tests
  -> Browser e2e tests
  -> Trace evaluation fixtures
```

## 3. Domain unit tests

### 3.1 MentionResolver

文件：

```text
packages/domain/test/mention-resolver.spec.ts
```

用例：

| 用例 | 期望 |
| --- | --- |
| `@TechLead` | resolves agent participant |
| `@tech-lead` | resolves role or alias |
| `@reviewer` multiple agents | returns role mention candidates |
| unknown mention | no candidate and warning |
| agent-authored text `@Engineer` | parsed but not triggerable |
| reply to agent bubble | resolves reply target |

### 3.2 TurnScheduler

文件：

```text
packages/domain/test/turn-scheduler.spec.ts
```

用例：

1. human @agent creates exactly one AgentTurn。
2. human @role creates matching role AgentTurn。
3. human @all-agents requires confirmation if agent count > threshold。
4. no mention does not fan out to all agents。
5. handoff_requested creates target AgentTurn。
6. duplicate event delivery is idempotent。
7. muted participant is skipped。
8. cooldown participant is delayed or skipped。
9. paused causal chain rejects new turns。
10. scheduler records blocked reason。

### 3.3 LoopGuard

文件：

```text
packages/domain/test/loop-guard.spec.ts
```

用例：

1. maxTurnsPerCausalChain blocks new turns。
2. maxAgentToAgentTurns pauses chain。
3. maxSamePairPingPong blocks pair。
4. human message resets consecutive-without-human count。
5. duplicate output similarity blocks repeated response。
6. budget exceeded produces approval/request event。

### 3.4 Handoff state machine

文件：

```text
packages/domain/test/handoff-state-machine.spec.ts
```

用例：

1. requested -> accepted -> completed。
2. requested -> rejected。
3. requested -> expired。
4. accepted handoff creates target turn。
5. rejected handoff does not create target turn。
6. source agent cannot handoff to forbidden role。

## 4. Context / memory tests

文件：

```text
packages/domain/test/context-assembler.spec.ts
packages/domain/test/procedural-memory.spec.ts
packages/domain/test/belief-snapshot.spec.ts
```

用例：

1. triggering event always included。
2. role contract always included。
3. private memory only visible to owner agent。
4. quarantined memory excluded。
5. context budget trims raw history before policies。
6. ContextSnapshot stores source refs。
7. belief snapshot detects stale result。
8. completed chain generates candidate procedural memory。
9. procedural memory requires human approval before use。
10. failed use increments failure count。

## 5. Security tests

文件：

```text
packages/domain/test/permission-policy.spec.ts
packages/domain/test/tool-plan-verifier.spec.ts
packages/domain/test/a2a-security.spec.ts
```

用例：

1. agent cannot approve its own high-risk tool plan。
2. forbidden tool is denied。
3. medium risk tool requires policy allow。
4. high risk tool requires human approval。
5. agent-origin text mention cannot trigger target agent。
6. structured handoff can trigger target agent if policy allows。
7. tool call cannot exist without tool plan。
8. memory conflict goes to quarantine。

## 6. API e2e tests

文件：

```text
apps/api/test/multi-agent-channel.e2e-spec.ts
apps/api/test/agent-turns.e2e-spec.ts
apps/api/test/handoffs.e2e-spec.ts
apps/api/test/context-snapshots.e2e-spec.ts
```

### 6.1 POST event schedules turn

```text
POST /api/channels/:channelId/events
body: user_message @TechLead

expect:
  201
  ChannelEvent created
  AgentTurn queued for TechLead
  no AgentTurn for Engineer
```

### 6.2 Handoff schedules target

```text
POST /api/channels/:channelId/handoffs
source: TechLead
target: Engineer

expect:
  handoff_requested event
  handoff status requested
  target AgentTurn queued
```

### 6.3 Loop guard

构造 A -> B -> A -> B -> A。

期望：

- 第 4 或第 5 次 agent-to-agent turn 被 block。
- 写入 `loop_guard_triggered` event。
- API 返回 suggested actions。

## 7. Web tests

文件：

```text
apps/web/src/features/chat/multi-agent-channel.spec.tsx
apps/web/src/features/chat/handoff-card.spec.tsx
apps/web/src/features/chat/loop-guard-banner.spec.tsx
apps/web/src/features/chat/agent-turn-inspector.spec.tsx
```

用例：

1. composer autocomplete shows agent and role。
2. sent mention creates queued indicator。
3. agent bubble shows reason。
4. clicking bubble opens turn inspector。
5. handoff card shows target and status。
6. approval card has approve/deny。
7. loop guard banner has continue once / summarize / pause。
8. participant mute toggles state。
9. context snapshot panel lists sources。
10. empty state gives concrete examples。

## 8. Browser E2E

文件：

```text
tests/e2e/multi-agent-channel.spec.ts
```

场景：

```text
1. 登录
2. 创建频道
3. 添加 TechLead、Engineer、Reviewer
4. 发送 @TechLead 请拆任务
5. mock TechLead 输出 handoff
6. Engineer turn queued
7. Engineer 输出结果
8. Reviewer critique
9. loop guard 在多轮后触发
10. 用户点击 summarize
```

## 9. Trace-native evaluation

TRACE 和 MEASE 的启发是：只看最终回复会错过过程问题。Miaochat 需要为每条 causal chain 计算 trajectory metrics。

### 9.1 Metrics

```ts
export type TrajectoryMetrics = {
  finalOutcome: "success" | "partial" | "failed" | "cancelled";
  turnCount: number;
  agentToAgentTurnCount: number;
  humanInterventionCount: number;
  handoffCount: number;
  handoffSuccessRate: number;
  duplicateOutputRate: number;
  staleResponseCount: number;
  toolPlanApprovalRate: number;
  failedToolCallCount: number;
  contextTokenTotal: number;
  estimatedCostUsd: number;
  loopGuardTriggered: boolean;
};
```

### 9.2 Utility score

P0 简化公式：

```text
trajectoryUtility =
  finalOutcomeScore
  + handoffSuccessBonus
  + verifiedToolBonus
  - duplicatePenalty
  - staleResponsePenalty
  - loopGuardPenalty
  - costPenalty
```

### 9.3 Eval fixtures

建议建立：

```text
ai/evals/multi-agent-channel/
  simple-human-mention.json
  handoff-engineer-reviewer.json
  ping-pong-loop.json
  stale-belief-correction.json
  malicious-agent-message.json
  memory-conflict.json
```

每个 fixture 包含：

- initial participants
- input events
- mocked model outputs
- expected events
- expected blocked turns
- expected metrics

## 10. CI gate

P0 合并门槛：

```text
pnpm exec eslint ...
pnpm --filter domain test
pnpm --dir apps/api exec vitest run test/multi-agent-channel.e2e-spec.ts
pnpm --filter web exec vitest run src/features/chat/multi-agent-channel.spec.tsx
pnpm exec playwright test tests/e2e/multi-agent-channel.spec.ts
```

## 11. 回归风险与测试重点

| 风险 | 测试 |
| --- | --- |
| agent 互相无限触发 | loop guard unit + e2e |
| 旧消息 UI 断裂 | legacy message compatibility tests |
| handoff 被当普通文本 | output envelope tests |
| private memory 泄漏 | context assembler tests |
| tool 越权 | permission tests |
| duplicate turn | idempotency tests |
| stale answer 不可见 | belief snapshot tests |
