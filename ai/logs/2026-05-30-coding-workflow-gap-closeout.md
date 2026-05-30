# 2026-05-30 Coding Workflow Gap Closeout

## Goal

收掉上一轮 review 里剩下的两个功能缺口：

- 不能再允许用户启动“没有人真正负责实现”的编码工作流
- 编码工作流状态事件里的 `successfulAgentCount / totalAgentCount` 不能再用任务数冒充成员数

## Root Causes

### 1. 无实现者组合仍然可启动

上一轮只做到了“删掉谁，后端就不启动谁”，但没有再往前一步限制推荐组合的最小可执行性。
结果是用户可以保留：

- `代码评审`
- `测试工程师`

然后启动一个名义上的“编码工作流”，但实际上没有任何成员承担实现职责。

### 2. 状态计数仍然按 taskSnapshot 计数

上一轮把计划人与执行人做成了动态角色组合，但 `conversation.status` 里的：

- `successfulAgentCount`
- `totalAgentCount`

还是用 `taskSnapshot` 在计数。
当同一位成员既负责计划又负责执行时，会把一个人算成两个人。

## What Changed

### Contract

在 `packages/contracts/src/coding-workflow.ts` 新增：

- `hasCodingWorkflowExecutor`
  - 至少要求保留一位能进入实现阶段的成员
  - 当前实现能力角色定义为 `tech_lead` 或 `software_engineer`
- `calculateCodingWorkflowAgentProgress`
  - 以真实参与角色计算工作流成员进度，而不是直接数任务数

同时修正 kickoff message：

- 单人工作流不再错误显示“其余参与成员先待命”

### Frontend

`WorkModeLauncher` 增加了第二道删除边界：

- 仍然禁止删到只剩 `0` 人
- 新增禁止删到“没有任何实现者”

并同步修正启动文案：

- 不再写死“技术负责人先提交计划”
- 改成当前第一位保留成员负责先提计划

### API

`CodingWorkflowsService.create()` 增加显式后端校验：

- 如果 `recommendedRoleIds` 里没有实现能力角色
- 直接返回 `400`
- 错误消息：`至少要保留 1 位能够进入实现阶段的 AI 同事。`

### Dispatch / Status Events

`CodingWorkflowsService` 和 `CodingWorkflowDispatchService` 发布 `conversation.status` 时：

- 改用 `calculateCodingWorkflowAgentProgress`
- `successfulAgentCount / totalAgentCount` 现在反映真实参与成员
- 不再把同一个人的计划任务和执行任务算成两个 agent

同时把固定四阶段的摘要文案改成中性表述，避免删掉评审后还出现“工程、评审和测试阶段已结束”。

## Tests Added Or Updated

### Frontend

- `WorkModeLauncher`
  - 阻止删除最后一位推荐成员
  - 阻止删除最后一位实现能力成员
  - 删除首位成员后，启动器文案会切换到新的计划负责人

### Contracts

- 推荐角色推导仍然正确
- `hasCodingWorkflowExecutor` 能区分可执行/不可执行组合
- 单成员 kickoff 文案正确
- 动态角色下成员进度计数正确

### API

- 新增 `POST /coding-workflows` 失败用例
  - 当只保留 `code_reviewer + qa_tester` 时返回 `400`

## Verification

- `pnpm --filter @agenthub/contracts test`
- `pnpm --filter web exec vitest run src/features/workmodes/work-mode-launcher.spec.tsx src/features/chat/chat-experience.spec.tsx`
- `pnpm --filter api build`
- `pnpm --filter worker build`
- `pnpm --filter web build`
- `pnpm exec vitest run tests/integration/coding-workflow-api.spec.ts`
- `pnpm exec vitest run tests/integration/coding-workflow-execution.spec.ts`
