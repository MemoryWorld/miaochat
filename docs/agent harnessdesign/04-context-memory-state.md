# Context、Memory 与 State 管理设计

## 1. 设计目标

多 agent 协作最危险的问题不是某个模型答错，而是系统不知道哪些状态可信、哪些状态只是候选、哪些状态已经提交。Miaochat 的 runtime 必须显式区分：

- immutable facts
- session/channel context
- agent private memory
- procedural memory
- candidate memory
- committed state
- external side effects

## 2. ContextAssembler

### 2.1 输入

```ts
export type BuildContextInput = {
  agentTurn: AgentTurn;
  triggeringEvent: ChannelEvent;
  participant: AgentParticipant;
  causalChain: CausalChain;
};
```

### 2.2 输出

```ts
export type BuiltContext = {
  snapshot: ContextSnapshot;
  messages: Array<{
    role: "system" | "developer" | "user" | "assistant" | "tool";
    content: string;
  }>;
};
```

### 2.3 上下文层级

优先级从高到低：

1. System safety policy
2. Workspace immutable facts
3. Agent role contract
4. Triggering event
5. Handoff payload
6. Current causal chain summary
7. Recent channel history
8. Relevant artifacts / attachments
9. Agent private memory
10. Procedural memory
11. Tool policy

### 2.4 裁剪原则

不能简单按时间截断。应按 source type 和任务相关性裁剪：

```ts
const contextBudget = {
  systemPolicy: "always",
  roleContract: "always",
  triggeringEvent: "always",
  handoffPayload: "always_if_exists",
  causalChainSummary: "prefer",
  recentChannelHistory: "bounded",
  privateMemory: "top_k",
  proceduralMemory: "top_k",
  rawToolOutput: "summarized",
};
```

## 3. Recent Channel History

### 3.1 设计原则

从社区经验看，“看见历史”和“触发发言”必须分离。因此：

- agent 默认可以读取最近频道历史。
- agent 不会因为读取历史自动发言。
- 触发权由 TriggerPolicy 控制。

### 3.2 注入格式

```text
<recent_channel_history>
  [2026-06-01T10:00:00Z] human: @TechLead 请拆任务
  [2026-06-01T10:00:25Z] TechLead: 计划如下...
  [2026-06-01T10:01:10Z] handoff_requested TechLead -> Engineer:
    goal: 实现同源代理修复
    acceptance: API e2e + Web test pass
</recent_channel_history>
```

### 3.3 过滤规则

- 不注入 `system_private`。
- 不注入其他 agent 的 private memory。
- `tool_result` 默认注入摘要，不注入完整 stdout。
- 高风险 tool output 需要标注 provenance。
- 被 quarantine 的 memory 不注入，除非 debug mode。

## 4. BeliefSnapshot

### 4.1 为什么需要

RBC 方向提醒：多 agent 协作中，agent 常基于过期信息行动。Miaochat 需要知道每个 agent 在发言时看到了什么，没有看到什么。

### 4.2 类型

```ts
export type BeliefSnapshot = {
  id: string;
  agentParticipantId: string;
  channelId: string;
  causalChainId: string;
  lastSeenEventId: string;
  includedEventIds: string[];
  excludedEventIds: Array<{
    eventId: string;
    reason: "token_budget" | "visibility" | "irrelevant" | "quarantined";
  }>;
  summary: string;
  createdAt: string;
};
```

### 4.3 过期检测

当 agent turn 完成前，若 channel 中出现影响同一 causal chain 的新事件：

```text
if newEvent.createdAt > beliefSnapshot.createdAt
  and newEvent.causalChainId == turn.causalChainId
  and newEvent.type in ["handoff_completed", "tool_call_completed", "approval_denied"]
then mark turn result as possibly_stale
```

UI 显示：

```text
这条回复基于旧上下文生成。期间 Engineer 已完成新工具调用。
```

## 5. Memory taxonomy

| 类型 | 作用 | 写入规则 |
| --- | --- | --- |
| WorkspaceFact | 长期事实，如项目技术栈 | 需人类确认 |
| ChannelSummary | 频道阶段性摘要 | 可自动生成，但可编辑 |
| AgentPrivateMemory | agent 自己的偏好、经验 | 需受 memory policy 限制 |
| ProceduralMemory | 成功流程 | 从 completed causal chain 生成，需批准 |
| CandidateMemory | 待验证记忆 | 默认写入这里 |
| QuarantinedMemory | 可疑或冲突记忆 | 不进 prompt |

## 6. Procedural Memory

### 6.1 论文启发

LEGOMem 与 procedural knowledge 方向的共同点：

- 成功轨迹应变成可复用 procedure。
- procedure 可以分配给 orchestrator 和 task agent。
- subtask memory 比全文历史更稳定。

### 6.2 类型

```ts
export type ProceduralMemory = {
  id: string;
  workspaceId: string;
  title: string;
  scope: "workspace" | "channel" | "agent_role" | "agent";
  ownerRoleKey: string | null;
  sourceCausalChainId: string;
  status: "candidate" | "approved" | "rejected" | "deprecated";
  summary: string;
  steps: Array<{
    id: string;
    title: string;
    description: string;
    ownerRoleKey?: string;
    requiredInputs: string[];
    expectedOutputs: string[];
    verification: string[];
  }>;
  antiPatterns: string[];
  successCount: number;
  failureCount: number;
  lastUsedAt: string | null;
  createdAt: string;
  updatedAt: string;
};
```

### 6.3 生成流程

```text
causal chain completed
  -> Trace summarizer extracts successful procedure
  -> create memory_candidate_created event
  -> human approves / edits
  -> memory_committed event
```

### 6.4 检索流程

```text
AgentTurn context build
  -> retrieve procedural memories by role + task similarity
  -> include top 3
  -> log ContextSourceRef
```

### 6.5 失败回写

如果引用某 procedural memory 的任务失败：

- `failureCount += 1`
- 记录失败 turn id。
- 若连续失败 3 次，状态变成 `deprecated_candidate`，需要 human review。

## 7. Candidate vs committed state

### 7.1 原则

模型输出永远先进入 candidate 层。只有 validator 或 human approval 通过后，才能进入 committed state。

```text
agent proposes memory
  -> candidate_memory
  -> validator checks conflicts
  -> human approval
  -> committed_memory
```

工具调用同理：

```text
agent proposes tool plan
  -> candidate_tool_plan
  -> policy validator
  -> optional human approval
  -> execute tool
  -> tool result
  -> commit side effect only if allowed
```

## 8. Checkpoint / rollback

### 8.1 Checkpoint 类型

```ts
export type RuntimeCheckpoint = {
  id: string;
  workspaceId: string;
  channelId: string;
  causalChainId: string;
  createdAfterEventId: string;
  snapshot: {
    chainStatus: string;
    participantStatuses: Record<string, string>;
    memoryRefs: string[];
    artifactRefs: string[];
    externalCommitRefs: string[];
  };
  createdAt: string;
};
```

### 8.2 自动 checkpoint 时机

- causal chain root 创建后。
- handoff accepted 后。
- tool plan approved 前。
- external write commit 前。
- memory committed 前。
- chain completed 后。

### 8.3 rollback 策略

P0 只支持逻辑 rollback：

- 标记后续 ChannelEvent 为 superseded。
- 不删除历史。
- 恢复 participant status。
- 将 candidate memory 移入 quarantined。

P1 支持外部 side effect compensation：

- 如果工具有 undo API，执行 compensation。
- 如果没有，生成 manual recovery task。

## 9. Memory conflict detection

### 9.1 冲突类型

| 冲突 | 示例 |
| --- | --- |
| fact conflict | 项目端口是 3000 vs 3001 |
| role conflict | Reviewer 被记成可直接修改代码 |
| procedure conflict | 旧流程要求直接请求 API host |
| user preference conflict | 用户要求中文 vs 英文 |

### 9.2 处理

- 冲突记忆不覆盖旧记忆。
- 新记忆进入 candidate 或 quarantined。
- UI 提醒 human resolve。

## 10. Unit tests 必须覆盖

文件建议：

```text
packages/domain/test/context-assembler.spec.ts
packages/domain/test/belief-snapshot.spec.ts
packages/domain/test/procedural-memory.spec.ts
packages/domain/test/memory-conflict.spec.ts
packages/domain/test/checkpoint-rollback.spec.ts
```

测试清单：

1. context assembler 永远包含 role contract。
2. private memory 不进入其他 agent context。
3. quarantined memory 不进入 normal context。
4. recent history 按 visibility 过滤。
5. token budget 不会裁掉 triggering event。
6. belief snapshot 记录 included/excluded event ids。
7. 新事件到达后可标记 turn result stale。
8. successful chain 可生成 candidate procedural memory。
9. procedural memory 需 approval 才 approved。
10. memory conflict 不覆盖 committed fact。
11. rollback 标记 events superseded，而不是删除。
12. external commit 前必须有 checkpoint。
