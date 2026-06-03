# 领域模型与 API 设计

## 1. 设计目标

领域模型要满足三件事：

1. 频道是 source of truth，所有协作都能回放。
2. Agent 发言、handoff、工具调用、审批都不是普通文本，而是 typed events。
3. 每次 agent 运行都有可审计的触发原因、上下文快照、预算和状态。

## 2. 核心实体关系

```text
Workspace
  └── Channel
        ├── ChannelEvent[]
        ├── AgentParticipant[]
        ├── CausalChain[]
        └── AgentTurn[]

AgentParticipant
  ├── RoleContract
  ├── TriggerPolicy
  ├── ToolPolicy
  ├── MemoryPolicy
  └── ReadCursor

AgentTurn
  ├── triggeringEventId
  ├── causalChainId
  ├── contextSnapshotId
  ├── runtimeResult
  └── producedEventIds[]

Handoff
  ├── sourceAgentId
  ├── targetAgentId / targetRole
  ├── payload
  ├── acceptanceStatus
  └── completionStatus
```

## 3. ChannelEvent

### 3.1 TypeScript 类型

```ts
export type ChannelEventType =
  | "user_message"
  | "agent_message"
  | "agent_turn_started"
  | "agent_turn_completed"
  | "agent_turn_failed"
  | "handoff_requested"
  | "handoff_accepted"
  | "handoff_rejected"
  | "handoff_completed"
  | "tool_plan_proposed"
  | "tool_call_started"
  | "tool_call_completed"
  | "tool_call_failed"
  | "approval_requested"
  | "approval_granted"
  | "approval_denied"
  | "memory_candidate_created"
  | "memory_committed"
  | "memory_quarantined"
  | "loop_guard_triggered"
  | "system_event";

export type ChannelEvent = {
  id: string;
  workspaceId: string;
  channelId: string;
  causalChainId: string | null;
  parentEventId: string | null;
  authorType: "human" | "agent" | "system" | "tool";
  authorId: string;
  type: ChannelEventType;
  content: string;
  structuredPayload: Record<string, unknown>;
  mentions: AgentMention[];
  visibility: "public" | "agent_private" | "system_private";
  provenance: EventProvenance;
  createdAt: string;
};
```

### 3.2 不变量

- `id` 全局唯一。
- `workspaceId`、`channelId` 必填。
- `type` 不允许使用自由字符串。
- `authorType=agent` 时 `authorId` 必须对应 `AgentParticipant.agentId` 或全局 agent id。
- `visibility=agent_private` 的事件默认不进入其他 agent 的 prompt。
- `causalChainId` 为空只允许用于系统初始化事件或孤立系统事件。
- 所有 `tool_call_*` 必须有对应 `tool_plan_proposed`。

## 4. AgentParticipant

### 4.1 TypeScript 类型

```ts
export type AgentParticipant = {
  id: string;
  workspaceId: string;
  channelId: string;
  agentId: string;
  displayName: string;
  roleKey: string;
  roleLabel: string;
  status: "available" | "queued" | "thinking" | "waiting_approval" | "muted" | "offline" | "error";
  roleContract: RoleContract;
  triggerPolicy: TriggerPolicy;
  toolPolicyId: string | null;
  memoryPolicy: MemoryPolicy;
  readCursor: AgentReadCursor;
  createdAt: string;
  updatedAt: string;
};

export type RoleContract = {
  owns: string[];
  doesNotOwn: string[];
  defaultHandoffTargets: Array<{
    condition: string;
    targetRoleKey: string;
  }>;
  mustAskBefore: string[];
  mustNotDo: string[];
  stopConditions: string[];
  responseStyle: {
    maxBullets?: number;
    requireActionableNextStep: boolean;
    avoidSpeculationWithoutLabel: boolean;
  };
};

export type TriggerPolicy = {
  respondToHumanMentions: boolean;
  respondToAgentMentions: boolean;
  respondToRoleMentions: boolean;
  respondToReplyToSelf: boolean;
  respondToAllAgents: boolean;
  allowBotOriginatedMentions: "never" | "handoff_only" | "same_causal_chain" | "explicit";
  cooldownSeconds: number;
  maxTurnsPerCausalChain: number;
  maxTurnsPerHour: number;
};

export type AgentReadCursor = {
  lastSeenEventId: string | null;
  lastSeenAt: string | null;
  beliefSnapshotId: string | null;
};
```

### 4.2 默认 TriggerPolicy

```ts
const defaultTriggerPolicy: TriggerPolicy = {
  respondToHumanMentions: true,
  respondToAgentMentions: false,
  respondToRoleMentions: true,
  respondToReplyToSelf: true,
  respondToAllAgents: false,
  allowBotOriginatedMentions: "handoff_only",
  cooldownSeconds: 15,
  maxTurnsPerCausalChain: 3,
  maxTurnsPerHour: 30,
};
```

## 5. AgentTurn

### 5.1 TypeScript 类型

```ts
export type AgentTurn = {
  id: string;
  workspaceId: string;
  channelId: string;
  agentParticipantId: string;
  agentId: string;
  triggeringEventId: string;
  causalChainId: string;
  reason:
    | "human_mention"
    | "human_role_mention"
    | "human_all_agents"
    | "agent_handoff"
    | "agent_mention_allowed"
    | "reply_to_agent"
    | "manual_retry"
    | "scheduled_followup";
  status:
    | "queued"
    | "context_building"
    | "running"
    | "waiting_approval"
    | "completed"
    | "skipped"
    | "failed"
    | "cancelled"
    | "blocked_by_loop_guard";
  contextSnapshotId: string | null;
  budget: AgentTurnBudget;
  runtimePolicyId: string | null;
  idempotencyKey: string;
  queuedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  producedEventIds: string[];
};

export type AgentTurnBudget = {
  maxInputTokens: number;
  maxOutputTokens: number;
  maxToolCalls: number;
  maxWallTimeMs: number;
  maxCostUsd: number | null;
};
```

### 5.2 幂等键

```text
idempotencyKey = sha256(channelId + triggeringEventId + agentParticipantId + reason + causalChainId)
```

要求：

- 同一触发事件不能为同一 agent 重复创建 turn。
- retry 必须使用新的 `reason=manual_retry`，并引用原 `AgentTurn.id`。

## 6. CausalChain

```ts
export type CausalChain = {
  id: string;
  workspaceId: string;
  channelId: string;
  rootEventId: string;
  status: "open" | "paused" | "completed" | "stopped_by_guard" | "failed";
  turnCount: number;
  agentToAgentTurnCount: number;
  maxTurns: number;
  maxAgentToAgentTurns: number;
  lastEventId: string | null;
  summary: string | null;
  createdAt: string;
  updatedAt: string;
};
```

## 7. Handoff

```ts
export type Handoff = {
  id: string;
  workspaceId: string;
  channelId: string;
  causalChainId: string;
  sourceAgentParticipantId: string;
  targetAgentParticipantId: string | null;
  targetRoleKey: string | null;
  status:
    | "requested"
    | "accepted"
    | "rejected"
    | "completed"
    | "expired"
    | "cancelled";
  payload: {
    goal: string;
    contextEventIds: string[];
    expectedArtifact?: string;
    acceptanceCriteria: string[];
    constraints: string[];
    deadline?: string;
  };
  createdEventId: string;
  acceptedEventId: string | null;
  completedEventId: string | null;
  createdAt: string;
  updatedAt: string;
};
```

规则：

- 模型自然语言里的 `@Engineer` 不自动等于 handoff。
- source agent 必须输出 structured handoff payload，runtime 才创建 `handoff_requested`。
- target agent turn 的 reason 必须是 `agent_handoff`。
- handoff 被拒绝时，source agent 或 human 需要重新分配 ownership。

## 8. ContextSnapshot

```ts
export type ContextSnapshot = {
  id: string;
  workspaceId: string;
  channelId: string;
  agentTurnId: string;
  agentParticipantId: string;
  causalChainId: string;
  sourceRefs: ContextSourceRef[];
  renderedPromptHash: string;
  renderedPromptPreview: string;
  tokenEstimate: {
    total: number;
    bySourceType: Record<string, number>;
  };
  redactions: Array<{
    sourceRefId: string;
    reason: string;
  }>;
  createdAt: string;
};

export type ContextSourceRef = {
  id: string;
  type:
    | "system_policy"
    | "role_contract"
    | "triggering_event"
    | "recent_channel_history"
    | "causal_chain_summary"
    | "handoff_payload"
    | "agent_private_memory"
    | "procedural_memory"
    | "tool_policy"
    | "user_attachment"
    | "workspace_fact";
  refId: string;
  included: boolean;
  tokenEstimate: number;
  priority: number;
};
```

## 9. 数据库表建议

### `channel_events`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | uuid | 主键 |
| workspace_id | uuid | workspace |
| channel_id | uuid | channel |
| causal_chain_id | uuid nullable | causal chain |
| parent_event_id | uuid nullable | parent event |
| author_type | text | human / agent / system / tool |
| author_id | text | actor id |
| type | text | ChannelEventType |
| content | text | 可读文本 |
| structured_payload | jsonb | typed payload |
| mentions | jsonb | mention list |
| visibility | text | public / agent_private / system_private |
| provenance | jsonb | 来源 |
| created_at | timestamptz | 创建时间 |

索引：

- `(workspace_id, channel_id, created_at)`
- `(causal_chain_id, created_at)`
- `(type, created_at)`
- GIN index on `mentions`

### `agent_participants`

| 字段 | 类型 |
| --- | --- |
| id | uuid |
| workspace_id | uuid |
| channel_id | uuid |
| agent_id | text |
| display_name | text |
| role_key | text |
| status | text |
| role_contract | jsonb |
| trigger_policy | jsonb |
| tool_policy_id | uuid nullable |
| memory_policy | jsonb |
| read_cursor | jsonb |
| created_at | timestamptz |
| updated_at | timestamptz |

唯一约束：

```text
unique(channel_id, agent_id)
```

### `agent_turns`

| 字段 | 类型 |
| --- | --- |
| id | uuid |
| workspace_id | uuid |
| channel_id | uuid |
| agent_participant_id | uuid |
| agent_id | text |
| triggering_event_id | uuid |
| causal_chain_id | uuid |
| reason | text |
| status | text |
| context_snapshot_id | uuid nullable |
| budget | jsonb |
| runtime_policy_id | uuid nullable |
| idempotency_key | text |
| queued_at | timestamptz |
| started_at | timestamptz nullable |
| completed_at | timestamptz nullable |
| error_code | text nullable |
| error_message | text nullable |
| produced_event_ids | jsonb |

唯一约束：

```text
unique(idempotency_key)
```

## 10. API 设计

### 10.1 Channel events

```http
GET /api/channels/:channelId/events
POST /api/channels/:channelId/events
GET /api/channels/:channelId/events/:eventId
```

`POST /events` 请求：

```json
{
  "type": "user_message",
  "content": "@TechLead 拆一下这个任务",
  "mentions": [{ "kind": "agent", "value": "tech-lead" }],
  "clientMutationId": "uuid"
}
```

响应：

```json
{
  "event": { "id": "evt_1", "type": "user_message" },
  "scheduledTurns": [
    {
      "id": "turn_1",
      "agentId": "tech-lead",
      "reason": "human_mention",
      "status": "queued"
    }
  ]
}
```

### 10.2 Agent participants

```http
GET /api/channels/:channelId/participants
POST /api/channels/:channelId/participants
PATCH /api/channels/:channelId/participants/:participantId
POST /api/channels/:channelId/participants/:participantId/mute
POST /api/channels/:channelId/participants/:participantId/unmute
```

### 10.3 Agent turns

```http
GET /api/channels/:channelId/turns
GET /api/agent-turns/:turnId
POST /api/agent-turns/:turnId/cancel
POST /api/agent-turns/:turnId/retry
GET /api/agent-turns/:turnId/context-snapshot
```

### 10.4 Handoff

```http
POST /api/channels/:channelId/handoffs
POST /api/handoffs/:handoffId/accept
POST /api/handoffs/:handoffId/reject
POST /api/handoffs/:handoffId/complete
```

### 10.5 Causal chain controls

```http
GET /api/channels/:channelId/causal-chains/:chainId
POST /api/channels/:channelId/causal-chains/:chainId/pause
POST /api/channels/:channelId/causal-chains/:chainId/resume
POST /api/channels/:channelId/causal-chains/:chainId/stop
POST /api/channels/:channelId/causal-chains/:chainId/summarize
```

## 11. Event stream

前端订阅：

```http
GET /api/channels/:channelId/events/stream
```

SSE event 示例：

```text
event: channel_event
data: {"id":"evt_1","type":"agent_message","authorId":"tech-lead"}

event: agent_turn_status
data: {"id":"turn_1","status":"running"}

event: loop_guard
data: {"causalChainId":"chain_1","reason":"max_same_pair_ping_pong"}
```

## 12. 迁移策略

现有 `conversation messages` 不需要立即废弃。P0 可以做兼容层：

```text
old conversation message
  -> render as ChannelEvent view model

new ChannelEvent
  -> optionally mirror into legacy messages for existing UI
```

建议迁移顺序：

1. 新增 domain 包类型和纯函数测试。
2. 后端新增 `channel_events`、`agent_turns`、`agent_participants` 表。
3. 现有发送消息 API 写入 ChannelEvent。
4. 现有 group orchestrator 产物写入 `agent_message` 和 `agent_turn_*` events。
5. UI 从 legacy messages 切到 ChannelEvent view model。
6. 再引入真正 event-driven scheduler。
