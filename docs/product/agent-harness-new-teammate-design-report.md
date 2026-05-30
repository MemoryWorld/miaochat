# Agent Harness 到 AI 同事配置的落地报告

## 结论

当前产品不应把 Agent Harness 直接讲给普通用户。用户要理解的是“这个 AI 同事怎么接任务、带上下文、用工具、留痕、失败后怎么恢复”。因此新建同事页面使用“协作护栏”表达 Agent Harness 的能力，而不是展示底层运行时概念。

## 来源核对

- 原始需求文件：`docs/product/original-requirements.md`
- 原始需求没有明确规定 Agent 必须运行在浏览器、本机或云端。
- 原始需求明确要求 IM 聊天、多 Agent 群聊协作、主 Agent 协调器、统一适配器层、上下文连续、用户自建 Agent。
- 当前可答辩表述：Web 端是用户入口；Agent 执行在服务端 Worker/Temporal 运行时；Worker 通过统一适配器连接模型和工具；未来桌面端可以扩展本地 Agent 进程管理。

## 菜鸟教程相关知识归纳

菜鸟教程中与 Agent Harness 最接近的内容集中在 AI Agent 教程体系下的 Harness Engineering、上下文工程、多智能体系统、工具调用、生产部署、工程化等主题。

参考资料：

- https://www.runoob.com/ai-agent/harness-engineering.html
- https://www.runoob.com/ai-agent/agent-context-engineering.html
- https://www.runoob.com/ai-agent/multi-agent-systems.html
- https://www.runoob.com/ai-agent/tool-calling.html
- https://www.runoob.com/ai-agent/production-deployment.html

这些内容可以归纳为八类能力。

| Agent Harness 概念 | 产品内用户语言 | 新建同事配置项 |
| --- | --- | --- |
| Control Plane | 先确认目标、边界和交付物 | 任务边界 |
| Context Engineering | 自动带上相关资料和历史 | 上下文资料包 |
| Runtime / Tool Sandbox | 只用被允许的工具 | 工具权限 |
| Approval / Human-in-the-loop | 高风险动作先问我 | 审批护栏 |
| Observability | 让我看得见它做了什么 | 过程记录 |
| Failure Recovery | 失败时说明原因并给重试方案 | 失败恢复 |
| Evaluation / Quality Gate | 交付前自检风险和验收标准 | 质量检查 |
| Model / Cost Routing | 按任务选择速度和质量偏好 | 模型偏好 |

## 用户可见设计

新建 AI 同事时，用户不需要知道“Agent Harness”是什么，只需要能选择以下行为。

- 任务边界：收到任务后先确认目标、边界、交付物和不做什么。
- 上下文资料包：自动参考频道历史、置顶消息、工作区资料和自己的长期记忆。
- 工具权限：只使用用户开放的工具；涉及代码、命令、文件或外部服务时遵守权限。
- 审批护栏：高风险动作、不可逆动作和关键决策先向用户确认。
- 过程记录：关键步骤留下可回放记录，方便用户知道它做了什么。
- 失败恢复：失败时说明原因、影响范围、下一次怎么重试或降级。
- 质量检查：交付前自检风险、测试方式、验收标准和下一步建议。

## 系统提示词落地

这些选择应写入 AI 同事的系统提示词，作为每次运行的行为约束。示例：

```text
协作护栏：任务边界：收到任务后先确认目标、边界、交付物和不做什么；上下文资料包：自动参考频道历史、置顶消息、工作区资料和自己的长期记忆；工具权限：只使用你开放的工具；审批护栏：高风险动作先向你确认；过程记录：关键步骤留下可回放记录；失败恢复：失败时说明原因和重试方案；质量检查：交付前自检风险、测试方式和验收标准。
```

## 工程落地优先级

1. 新建同事页面展示“协作护栏”配置，并写入系统提示词。
2. 频道消息中按 AI 同事分别展示回复，而不是合并成一条匿名总回复。
3. 对长耗时模型调用增加更长的消息刷新兜底，避免用户误以为没有回复。
4. 后续再把过程记录、失败恢复和质量检查做成可查询的运行记录页面。

## 答辩表达

建议对评委这样讲：

“我们把多 Agent 平台拆成用户侧 IM 体验和服务端 Agent 运行底座。用户看到的是 AI 同事、频道、任务和交付物；系统内部用 Worker 执行 Agent，通过统一适配器接模型和工具，并把上下文、权限、审批、日志、失败恢复这些能力沉淀成可配置的协作护栏。这样既满足原题的多 Agent 协作，也为后续扩展成 Agent 应用基础设施平台留下接口。”
