# Built-In Agent Spec Pivot

## Scope

- Promote the new active product direction from shell-only Chinese rewrite to a
  built-in AI coding workforce model
- Keep this as specification work only
- Do not start implementing the new product model yet

## Skills Used

- `using-agent-skills`
- `编程技能包`
- `spec-driven-development`
- `documentation-and-adrs`

## What Was Added

- Active spec:
  [ai/specs/2026-05-28-phase-c-built-in-agent-coding-workspace.md](../specs/2026-05-28-phase-c-built-in-agent-coding-workspace.md)
- Matching plan:
  [ai/plans/phase-c-built-in-agent-coding-workspace-plan.md](../plans/phase-c-built-in-agent-coding-workspace-plan.md)
- Matching tasks:
  [ai/tasks/phase-c-built-in-agent-coding-workspace-tasks.md](../tasks/phase-c-built-in-agent-coding-workspace-tasks.md)

## Key Decisions Frozen

- 普通客户不再需要理解 `Codex / Claude Code / Hermes / OpenClaw`
- 产品主实体改为 `工作模式 + AI 同事 + 任务 + 编码会话 + 审批`
- 第一条完整工作流只做 `编码`
- 默认内置四个角色：
  - 技术负责人
  - 软件工程师
  - 代码评审
  - 测试工程师
- 技术负责人必须先交计划，用户确认后才进入执行
- `morph-labs/hermes-agent-fork` 作为优先 internal runtime 方向
- Claude internal runtime 继续等待用户提供旧源码后再进入实现

## What Did Not Happen

- No runtime migration landed
- No schema replacement landed
- No built-in teammate implementation landed
- No work-mode launcher implementation landed

## Next Recommended Slice

Start from:

1. `Task C02`: replace post-login primary CTA with the work-mode launcher
2. `Task C04`: reframe `/agents` into an `AI 同事` directory
