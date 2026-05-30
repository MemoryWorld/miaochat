# Product Vocabulary

## Scope

This document is the source of truth for customer-facing product copy in the
workspace shell, teammate shell, tasks, calendar, approvals, settings, and AI
teammate creation flows.

## Naming Guardrails

- Do not use internal backend names in product copy, routes, or generated code
  comments.
- Use `AI 同事` or the concrete role name instead of implementation identity.
- Use `模型连接` for the customer-visible model setup path.
- Keep architecture explanation out of daily-use pages.

## Primary Product Terms

| Domain | Canonical Chinese term | Usage |
|---|---|---|
| Workspace | 工作区 | The top-level collaboration space |
| Workbench | 工作台 | Start or resume work |
| Inbox | 收件箱 | Unified attention surface |
| Tasks | 任务 | Shared task system |
| Calendar | 日历 | Shared calendar system |
| Channel | 频道 | Team discussion and working context |
| AI Teammate | AI 同事 | First-class actor in the workspace |
| Files | 文件 | Scoped file/workspace surface |
| Capabilities | 能力 | Visible teammate capabilities |
| Memory | 记忆 | Persistent contextual memory surface |
| Settings | 设置 | Workspace and account administration |
| Approval | 审批 | Human confirmation surface |
| Activity | 活动 | Structured execution trace |
| Model Connection | 模型连接 | Workspace model API setup |
| Coding Session | 编码会话 | Plan-first coding workflow |

## Status Terms

### Workflow Status

- 需求澄清
- 计划待确认
- 执行中
- 评审中
- 测试中
- 待用户确认
- 已完成

### Task State

- 待办
- 进行中
- 待审核
- 已完成

### Inbox Types

- 审批
- 提醒
- 任务更新
- 日历更新
- 连接提醒
- 风险提示

## Role Terms

- 技术负责人
- 软件工程师
- 代码评审
- 测试工程师

Product copy should prefer concrete role names over generic implementation
language.

## Advanced / Admin Terms

Allowed in settings or administrator documentation:

- 模型连接
- API Key
- 工作区权限
- 能力权限
- 审批方式
- 记忆方式

These terms should not dominate the workbench, channel timeline, or teammate
cards.
