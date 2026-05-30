# Phase C Coding Workflow Runtime Slice

## Date

- 2026-05-28

## Skills Used

- `编程技能包`
- `using-agent-skills`
- `incremental-implementation`
- `test-driven-development`
- `api-and-interface-design`
- `frontend-ui-engineering`
- `documentation-and-adrs`

## Scope

Completed the remaining `Phase C` execution slice from
`phase-c-built-in-agent-coding-workspace-plan.md`:

- product-level coding workflow contract
- persisted workflow + approval model
- plan gate decisions
- sequential engineering / review / QA execution path
- Chinese task-state panel and approval history
- internal runtime backend registry

## Files Added

- `packages/contracts/src/coding-workflow.ts`
- `db/migrations/0019_coding_workflows.sql`
- `apps/api/src/modules/coding-workflows/coding-workflow-dispatch.service.ts`
- `apps/api/src/modules/coding-workflows/coding-workflows.controller.ts`
- `apps/api/src/modules/coding-workflows/coding-workflows.module.ts`
- `apps/api/src/modules/coding-workflows/coding-workflows.service.ts`
- `apps/web/src/features/chat/coding-workflow-panel.tsx`
- `apps/worker/src/activities/internal-runtime-agent.activity.ts`
- `apps/worker/src/activities/internal-runtime-registry.ts`
- `apps/worker/src/workflows/internal-runtime-agent.workflow.ts`
- `apps/worker/test/internal-runtime-registry.spec.ts`
- `tests/integration/coding-workflow-api.spec.ts`
- `docs/architecture/phase-c-internal-runtime-registry.md`

## Files Updated

- `packages/contracts/src/index.ts`
- `packages/contracts/src/orchestrator-event.ts`
- `db/schema.ts`
- `apps/api/src/app.module.ts`
- `apps/api/src/modules/custom-agents/custom-agents.module.ts`
- `apps/web/src/features/agents/built-in-coding-team.ts`
- `apps/web/src/features/chat/chat-experience.tsx`
- `apps/web/src/features/chat/chat-experience.spec.tsx`
- `apps/web/src/features/chat/chat-message.tsx`
- `apps/web/src/features/chat/chat-thread.tsx`
- `apps/web/src/features/chat/system-status-card.tsx`
- `apps/web/src/features/workmodes/work-mode-launcher.tsx`
- `apps/worker/src/activities/index.ts`
- `apps/worker/src/worker-options.ts`
- `apps/worker/src/workflows/index.ts`
- `ai/tasks/phase-c-built-in-agent-coding-workspace-tasks.md`

## Verification Run

Passed:

- `pnpm --filter web exec tsc -p tsconfig.json --noEmit`
- `pnpm --filter web exec vitest run src/features/chat/chat-experience.spec.tsx src/app/agents/page.spec.tsx src/features/chat/use-conversation-stream.spec.tsx`
- `pnpm --filter web test`
- `pnpm --filter web build`
- `pnpm --filter api build`
- `pnpm --filter worker test`
- `pnpm --filter worker build`
- `pnpm exec vitest run tests/integration/coding-workflow-api.spec.ts`
- `pnpm exec vitest run tests/integration/coding-workflow-execution.spec.ts`
- `pnpm exec vitest run tests/integration/phase-a-runtime-baseline.spec.ts`

## Debug Note

The first execution-integration attempt failed because the local Hermes test
server chose canned responses by searching for role names anywhere in the
prompt. The approved plan text contains all built-in role names, so the fake
runtime returned the reviewer response for every stage. The test now keys off
the explicit role instruction (`请以软件工程师身份` / `请以代码评审身份` /
`请以测试工程师身份`) and always cancels the SSE reader in `finally`, which
prevents both false failures and teardown hangs.

## Outcome

The product now has a first-class built-in coding workflow:

- `技术负责人` posts the plan first
- user can `批准 / 要求修改 / 拒绝`
- execution stages are visible as `执行中 / 评审中 / 测试中`
- task states render as `待办 / 进行中 / 待审核 / 已完成`
- approval history stays attached to the same conversation context
- built-in execution runs through an internal runtime backend registry instead
  of exposing provider identity in the main shell
