# 2026-05-30 Coding Workflow Dynamic Recommended Team

## Goal

让首页 `工作模式` 里删掉的推荐 AI 同事不只是前端展示变化，而是真的影响后端编码工作流的计划人、任务快照、执行队列和运行时调用。

## Why This Change Was Needed

之前的状态只有前端删除卡片：

- 首页可以删掉推荐卡片
- 但 `/coding-workflows` 仍然默认启动固定四角色
- worker dispatch 仍然写死 `软件工程师 -> 代码评审 -> 测试工程师`

这会导致 UI 和真实执行链不一致，用户删掉成员后，后端仍然会启动被删掉的角色。

## What Changed

### Contract

- `createCodingWorkflowInputSchema` 新增 `recommendedRoleIds`
- `codingWorkflowDetailSchema` 新增
  - `planningRole`
  - `planningTeammateId`
  - `executionStageAssignments`
- 新增角色推导与任务快照 helper：
  - `normalizeRecommendedRoleIds`
  - `derivePlanningRole`
  - `deriveExecutionRoles`
  - `buildInitialCodingTaskSnapshotForRoles`
  - `buildExecutionTaskId`

### Frontend

- `WorkModeLauncher` 提交时会把当前剩余卡片映射成 `recommendedRoleIds`
- `ChatExperience` 创建编码工作流时会把 `recommendedRoleIds` 发给 API
- `CodingWorkflowPanel` 不再假设固定是“技术负责人 + 四阶段固定链”，计划门禁和成员标签改成基于真实工作流详情渲染

### API / Persistence

- `coding_workflows` 新增持久化字段：
  - `planning_teammate_id`
  - `planning_role`
  - `execution_stage_assignments`
- 创建工作流时：
  - 按 `recommendedRoleIds` 计算真实计划人
  - 只把保留下来的推荐角色加入会话参与者
  - 只为保留下来的角色生成任务快照和执行队列
- 计划重提时会沿用当前工作流里的真实角色集合，而不是回退到固定四角色

### Dispatch Runtime

- `CodingWorkflowDispatchService` 不再写死工程师/评审/测试三段
- 改为遍历 `executionStageAssignments`
- 每个阶段的 prompt、状态标签、活动记录、记忆记录都按真实角色生成

## Verification

- `pnpm --filter @agenthub/contracts test`
- `pnpm --filter web exec vitest run src/features/workmodes/work-mode-launcher.spec.tsx src/features/chat/chat-experience.spec.tsx`
- `pnpm --filter api build`
- `pnpm --filter worker build`
- `pnpm --filter web build`
- `pnpm db:migrate`
- `pnpm exec vitest run tests/integration/coding-workflow-api.spec.ts`
- `pnpm exec vitest run tests/integration/coding-workflow-execution.spec.ts`

## Behavior Proven By Tests

- 删掉 `代码评审` 后，前端 POST 会发送：
  - `recommendedRoleIds: ["tech_lead", "software_engineer", "qa_tester"]`
- API 返回的工作流详情里不再把 `代码评审` 当作本次参与成员
- 任务快照里不再包含评审任务
- 批准计划后，真实运行时只会执行剩余成员
- 本地 Hermes 假服务请求数从固定 3 次收敛为 2 次
- 活动记录、状态事件、memory records 里都不再出现被删掉的角色

## New Files

- `db/migrations/0021_coding_workflow_dynamic_recommended_roles.sql`
- `ai/logs/2026-05-30-coding-workflow-dynamic-recommended-team.md`
