# Miaochat Multi-Agent Harness PRD 文档索引

日期：2026-06-01
目标项目：Miaochat
主题：将当前多 AI 同事协作从 `group-orchestrator` 式 request/response workflow，重构为可治理、可追踪、可恢复的 multi-agent channel harness。

## 设计结论

Miaochat 的下一阶段不应继续把多 agent 当成“一次用户输入触发多个 worker 并聚合结果”。正确方向是把频道变成 agent runtime 的 source of truth：

```text
ChannelEvent 写入
  -> MentionResolver / TriggerPolicy 判断谁应响应
  -> TurnScheduler 生成 AgentTurn
  -> ContextAssembler 生成 ContextSnapshot
  -> AgentRuntime 执行模型与工具
  -> 输出新的 ChannelEvent / Handoff / ToolResult
  -> LoopGuard / Budget / HumanApproval 控制后续传播
```

这组文档把这个方向落成产品需求、领域模型、运行时设计、UI、权限、安全、测试和实施路线。

## 文件列表

| 文件 | 用途 |
| --- | --- |
| `01-product-prd.md` | 总 PRD：背景、目标、用户场景、范围、指标、功能清单 |
| `02-domain-model-and-api.md` | 核心领域模型、数据库建议、API、事件协议 |
| `03-turn-scheduler-runtime.md` | Turn Scheduler、mention resolver、loop guard、handoff 执行语义 |
| `04-context-memory-state.md` | ContextSnapshot、shared channel history、private memory、procedural memory、checkpoint/rollback |
| `05-security-permissions-governance.md` | 多 agent 权限、安全、MCP/tool plan verification、审计、信任评分 |
| `06-ui-ux-spec.md` | 频道页、agent 设置、run detail、trace/debug UI、空状态和交互细节 |
| `07-testing-and-evaluation-plan.md` | 单元测试、集成测试、E2E、trace-native evaluation、回归指标 |
| `08-implementation-roadmap.md` | 分阶段落地路线、迁移策略、验收门槛、风险清单 |

## 论文与调研映射

| 论文/方向 | 对 Miaochat 的直接启发 | 落入文档 |
| --- | --- | --- |
| GraphPlanner | 动态选择 agent role、模型与工作流路径，而不是固定 fan-out | `03-turn-scheduler-runtime.md` |
| ReAcTree | 长程任务需要层级 agent tree 与控制流节点 | `03-turn-scheduler-runtime.md` |
| D3MAS | 减少多 agent 知识重复，分层 decomposition / reasoning / memory | `02-domain-model-and-api.md`, `04-context-memory-state.md` |
| LEGOMem | 成功轨迹沉淀为 orchestrator memory 与 task-agent memory | `04-context-memory-state.md` |
| Procedural Knowledge Improves Agentic LLM Workflows | 显式过程知识能提升复杂 agent task 的稳定性 | `04-context-memory-state.md` |
| RBC | 多 agent 协作需要处理信息延迟与过期 belief state | `04-context-memory-state.md` |
| MEASE | 多 agent 轨迹需要可解释的 episode / action sequence | `07-testing-and-evaluation-plan.md` |
| TRACE | 评估不能只看最终结果，要评估轨迹质量、效率、鲁棒性 | `07-testing-and-evaluation-plan.md` |
| SentinelNet | 多 agent 消息需要信誉评分和恶意/异常行为检测 | `05-security-permissions-governance.md` |
| SecureCollaRAG | 多源知识需要 Byzantine-tolerant 验证与 provenance | `05-security-permissions-governance.md` |
| IntentGuard | MCP/tool metadata poisoning 需要 post-decision semantic plan verification | `05-security-permissions-governance.md` |
| Information Fidelity in Tool-Using LLM Agents | 多步工具链需要 re-grounding interval 和语义漂移控制 | `04-context-memory-state.md`, `05-security-permissions-governance.md` |

## 关键产品原则

1. 频道事件流是事实源，不是 UI 附属品。
2. agent 能看到历史，不代表它有权发言。
3. handoff 必须是 typed event，不应只藏在自然语言里。
4. 每个 agent 都要有 role contract、private memory、tool policy、read cursor。
5. 每一次发言都是一个可追踪 AgentTurn。
6. 每一个工具调用必须有 plan、validator、result、commit boundary。
7. 多 agent 协作必须默认带 loop guard、budget、cooldown、pause/mute。
8. 评估要看 trajectory，不只看 final answer。
