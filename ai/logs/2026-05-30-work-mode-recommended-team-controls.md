# 2026-05-30 Work Mode Recommended Team Controls

## Trigger

用户要求调整首页工作模式里的推荐 AI 同事卡片体验：

- 不再使用 `内置角色`
- 标签改成 `推荐`
- 每张卡片右上角增加红色删除按钮
- 删除前必须二次确认
- 只剩最后一位时不能删除，并弹出提示 `对不起，不能这样哦`

## Skills Used

- `using-agent-skills`
- `frontend-ui-engineering`
- `test-driven-development`

## Changes

- 更新 [apps/web/src/features/workmodes/work-mode-launcher.tsx](/home/torch/miaochat/apps/web/src/features/workmodes/work-mode-launcher.tsx:1)
  - 将首页推荐卡片标签从 `内置角色` 改为 `推荐`
  - 增加推荐成员可删除交互
  - 增加确认删除弹窗
  - 增加最后一位成员的阻止删除提示弹窗
  - 收紧文案，淡化“默认内置团队”的表达
- 新增 [apps/web/src/features/workmodes/work-mode-launcher.spec.tsx](/home/torch/miaochat/apps/web/src/features/workmodes/work-mode-launcher.spec.tsx:1)
  - 验证推荐标签展示
  - 验证确认删除
  - 验证最后一位成员不可删除

## Verification

- `pnpm --filter web exec vitest run src/features/workmodes/work-mode-launcher.spec.tsx src/features/chat/chat-experience.spec.tsx`
- `pnpm --filter web build`

## Known Boundary

这次只完成了首页 `工作模式` 的推荐成员交互层。

当前后端 `coding_workflows` 仍然是固定四角色契约：

- `tech_lead_agent_id`
- `engineer_agent_id`
- `reviewer_agent_id`
- `qa_agent_id`

因此，**当前删除推荐卡片只影响前端推荐组合展示，不会改变后端真实启动的固定工作流成员集合。**

如果后续要把“删除推荐成员”真正落到执行层，需要继续改：

- `packages/contracts/src/coding-workflow.ts`
- `apps/api/src/modules/coding-workflows/coding-workflows.service.ts`
- `apps/api/src/modules/coding-workflows/coding-workflow-dispatch.service.ts`
- `db/schema.ts` 和相关 migration
