# 安全、权限与治理设计

## 1. 设计目标

多 agent 协作的安全问题不是单个 agent 越权那么简单，而是错误信息、恶意消息、污染知识、错误工具计划会在 agent 网络里传播。因此 Miaochat 需要：

- agent 身份独立。
- role contract 与 tool policy 强绑定。
- agent-to-agent 消息可审计。
- tool plan 先验证再执行。
- memory write 先隔离再提交。
- 对来源和可信度做显式标注。

## 2. Agent identity

每个 agent 在频道中必须是独立 actor，而不是 impersonate human。

```ts
export type ActorIdentity = {
  actorType: "human" | "agent" | "system" | "tool";
  actorId: string;
  displayName: string;
  workspaceRole: "owner" | "admin" | "member" | "viewer" | "agent";
  capabilityTier: CapabilityTier;
};

export type CapabilityTier =
  | "read_only"
  | "draft_only"
  | "comment"
  | "propose_tool_plan"
  | "execute_low_risk_tools"
  | "execute_with_approval"
  | "admin";
```

## 3. Permission model

### 3.1 权限维度

| 维度 | 示例 |
| --- | --- |
| Channel read | 能否读取频道事件 |
| Channel write | 能否发消息 |
| Agent mention | 能否点名其他 agent |
| Handoff | 能否发起 handoff |
| Tool plan | 能否提出工具计划 |
| Tool execute | 能否执行工具 |
| Memory read | 能否读取 workspace / private / procedural memory |
| Memory write | 能否创建 memory candidate |
| Approval | 能否批准高风险动作 |

### 3.2 策略类型

```ts
export type AgentPermissionPolicy = {
  participantId: string;
  canReadChannel: boolean;
  canWriteChannel: boolean;
  canMentionAgents: boolean;
  canMentionRoles: boolean;
  canMentionAllAgents: boolean;
  canInitiateHandoff: boolean;
  canCreateToolPlan: boolean;
  allowedToolRisk: "none" | "low" | "medium" | "high_with_approval";
  memoryReadScopes: Array<"own_private" | "channel" | "workspace" | "procedural">;
  memoryWriteScopes: Array<"candidate_private" | "candidate_workspace" | "procedural_candidate">;
};
```

## 4. Tool policy

### 4.1 Tool risk levels

| 风险 | 示例 | 默认策略 |
| --- | --- | --- |
| low | read file、search、fetch readonly data | 可自动执行 |
| medium | create draft、run tests、write local artifact | 需要 policy allow |
| high | send email、delete data、write DB、deploy | 必须 human approval |
| forbidden | exfiltrate secrets、disable audit、modify billing | 直接拒绝 |

### 4.2 Tool plan

任何 medium/high 工具调用前，agent 必须产生 `tool_plan_proposed`：

```ts
export type ToolPlan = {
  id: string;
  agentTurnId: string;
  proposedByAgentId: string;
  summary: string;
  calls: ProposedToolCall[];
  riskLevel: "low" | "medium" | "high" | "forbidden";
  expectedSideEffects: string[];
  rollbackPlan: string | null;
  status: "proposed" | "approved" | "denied" | "executed" | "failed";
};

export type ProposedToolCall = {
  toolName: string;
  inputSchemaVersion: string;
  input: Record<string, unknown>;
  idempotencyKey: string;
};
```

## 5. IntentGuard-style semantic plan verification

IntentGuard 的启发是：单个工具调用看起来合法，不代表整条计划符合用户意图。Miaochat 应做 post-decision semantic verification。

### 5.1 Validator 输入

```ts
export type PlanVerificationInput = {
  userIntent: string;
  roleContract: RoleContract;
  toolPlan: ToolPlan;
  recentChannelSummary: string;
  knownConstraints: string[];
};
```

### 5.2 Validator 输出

```ts
export type PlanVerificationResult = {
  verdict: "allow" | "deny" | "needs_human_approval";
  reasons: string[];
  detectedRisks: Array<
    | "intent_mismatch"
    | "metadata_poisoning"
    | "excessive_scope"
    | "missing_rollback"
    | "secret_exposure"
    | "unverified_target"
  >;
};
```

## 6. Information fidelity controls

Information Fidelity 方向提醒：多步工具链会出现语义漂移。Miaochat 应设置 re-grounding interval。

### 6.1 Re-grounding 规则

每 N 次工具调用后，必须重新对齐：

```text
原始用户目标
当前 chain summary
已执行 tool calls
剩余任务
是否仍符合 role contract
```

默认：

```ts
const reGroundingPolicy = {
  maxToolCallsBeforeRegrounding: 3,
  maxAgentTurnsBeforeRegrounding: 4,
  requireRegroundingBeforeHighRiskTool: true,
};
```

## 7. Trust and provenance

### 7.1 EventProvenance

```ts
export type EventProvenance = {
  sourceType:
    | "human_input"
    | "agent_model_output"
    | "tool_result"
    | "retrieved_document"
    | "memory"
    | "system_policy";
  sourceId: string | null;
  modelId?: string;
  toolName?: string;
  confidence: number | null;
  trustScore: number | null;
  verified: boolean;
  verificationRefs: string[];
};
```

### 7.2 Trust score

P0 可先不用复杂模型，只做规则分：

| 来源 | 初始 trust |
| --- | --- |
| human owner | 1.0 |
| committed workspace fact | 0.95 |
| verified tool result | 0.9 |
| agent model output | 0.55 |
| unverified web result | 0.45 |
| candidate memory | 0.35 |
| quarantined memory | 0 |

P1 引入 SentinelNet 风格的 agent message credibility detector。

## 8. Knowledge corruption 防护

SecureCollaRAG 方向对应 Miaochat：

- 每个知识片段必须有 source。
- 多 agent 引用知识时保留 provenance。
- 重要结论需要至少两个独立来源或 human confirmation。
- 冲突知识不直接覆盖旧知识。

### 8.1 Knowledge validation event

```ts
export type KnowledgeValidation = {
  claim: string;
  sourceRefs: string[];
  verdict: "verified" | "conflicting" | "unsupported" | "needs_review";
  validator: "rule" | "model" | "human";
};
```

## 9. Agent-to-agent 安全

### 9.1 默认限制

- agent 普通文本里的 @mention 不触发其他 agent。
- agent 不能向另一个 agent 发 system-level instruction。
- agent 不能要求另一个 agent 忽略 role contract。
- agent 不能读取另一个 agent private memory。
- agent 不能批准自己的高风险 tool plan。

### 9.2 A2A message envelope

```ts
export type AgentToAgentMessage = {
  sourceAgentId: string;
  targetAgentId: string;
  messageType: "handoff" | "critique" | "clarification" | "status_request";
  content: string;
  constraints: string[];
  cannotOverride: ["system_policy", "role_contract", "tool_policy"];
};
```

## 10. Audit trail

每个关键动作必须可审计：

| 动作 | 必须记录 |
| --- | --- |
| agent turn start | triggering event、reason、policy |
| context build | included sources、redactions |
| model output | model id、prompt hash、output hash |
| handoff | source、target、payload、status |
| tool plan | plan、validator result、approval |
| tool call | input hash、result、side effects |
| memory write | candidate、validator、approval |
| rollback | checkpoint、superseded events |

## 11. Human approval

### 11.1 Approval request

```ts
export type ApprovalRequest = {
  id: string;
  workspaceId: string;
  channelId: string;
  requestedByAgentId: string;
  type: "tool_plan" | "memory_commit" | "external_send" | "rollback" | "all_agents_trigger";
  riskLevel: "medium" | "high";
  summary: string;
  payloadRef: string;
  status: "pending" | "approved" | "denied" | "expired";
  createdAt: string;
};
```

### 11.2 UI 要求

审批卡必须显示：

- 谁请求。
- 为什么需要。
- 会改变什么。
- rollback plan。
- approve / deny / edit plan。

## 12. Unit tests 必须覆盖

文件建议：

```text
packages/domain/test/permission-policy.spec.ts
packages/domain/test/tool-plan-verifier.spec.ts
packages/domain/test/a2a-security.spec.ts
packages/domain/test/provenance-trust.spec.ts
apps/api/test/approvals.e2e-spec.ts
```

测试清单：

1. agent 普通 @mention 不触发目标 agent。
2. structured handoff 可触发目标 agent。
3. agent 不能批准自己的 high risk plan。
4. high risk tool plan 必须产生 approval request。
5. forbidden tool 直接 deny。
6. private memory 不可跨 agent 读取。
7. unverified source trust score 低于 committed fact。
8. conflicting memory 进入 quarantine。
9. validator 检出 intent mismatch 时 deny。
10. 每个 tool call 都能追溯到 tool plan。
