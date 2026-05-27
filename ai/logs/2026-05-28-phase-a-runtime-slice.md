# Phase A Runtime Slice

## Scope

- Complete the implementation tasks in
  [ai/tasks/phase-a-hermes-openclaw-baseline-tasks.md](../tasks/phase-a-hermes-openclaw-baseline-tasks.md)
  from runtime wiring through delivery closeout.
- Keep the milestone restricted to `Hermes` and `OpenClaw`.
- Preserve the existing mock path for regression coverage.

## Skills Used

- `using-agent-skills`
- `incremental-implementation`
- `test-driven-development`
- `api-and-interface-design`
- `context-engineering`

## What Landed

- Added an adapter factory in
  [packages/agent-adapters/src/index.ts](../../packages/agent-adapters/src/index.ts)
  so runtime selection now depends on `provider + executionMode` rather than
  hardcoded direct/group mock instantiation.
- Added
  [apps/worker/src/activities/provider-runtime.ts](../../apps/worker/src/activities/provider-runtime.ts)
  to enforce the Phase A provider scope, resolve the latest valid BYOK
  credential for `Hermes` and `OpenClaw`, and build the execution-specific
  adapter instance.
- Updated the direct and group worker activities to route through the runtime
  factory instead of `MockDirectAdapter` / `MockGroupAdapter`.
- Updated the API dispatch service and workflow inputs so real providers can
  flow through direct and group execution paths with the required owner/provider
  context.
- Added
  [packages/agent-adapters/test/adapter-factory.spec.ts](../../packages/agent-adapters/test/adapter-factory.spec.ts)
  to lock the factory contract.
- Added
  [tests/integration/phase-a-runtime-baseline.spec.ts](../../tests/integration/phase-a-runtime-baseline.spec.ts)
  to prove:
  - BYOK credential binding for `Hermes` and `OpenClaw`
  - direct runtime execution for each provider
  - pinned-context replay into the Hermes request body
  - mixed-provider group orchestration through the real runtime path
- Extended
  [tests/e2e/byok-onboarding.spec.tsx](../../tests/e2e/byok-onboarding.spec.tsx)
  so the guided setup flow now has a smoke case for both `OpenClaw` and
  `Hermes`.
- Updated the milestone-facing operational and demo docs to distinguish Phase A
  evidence from the still-open full Release 1 gate.

## Verification

- `pnpm --filter @agenthub/agent-adapters test`
- `pnpm --filter worker test`
- `pnpm --filter api build`
- `pnpm --filter worker build`
- `pnpm exec vitest run tests/integration/phase-a-runtime-baseline.spec.ts`
- `pnpm exec vitest run tests/integration/single-agent-mock.spec.ts tests/integration/pinned-context.spec.ts tests/integration/group-orchestrator.spec.ts tests/integration/group-failure.spec.ts`
- `pnpm exec vitest run tests/e2e/hermes-real.spec.ts tests/e2e/openclaw-real.spec.ts`
- `pnpm exec vitest run tests/e2e/byok-onboarding.spec.tsx`
- `pnpm exec eslint apps/api/src/modules/messages/message-dispatch.service.ts apps/worker/src/activities/direct-agent.activity.ts apps/worker/src/activities/dispatch-agent.activity.ts apps/worker/src/activities/provider-runtime.ts apps/worker/src/workflows/single-agent.workflow.ts apps/worker/src/workflows/group-orchestrator.workflow.ts packages/agent-adapters/src/index.ts packages/agent-adapters/test/adapter-factory.spec.ts tests/integration/phase-a-runtime-baseline.spec.ts tests/e2e/byok-onboarding.spec.tsx`

## Infra Notes

- The local verification run used
  `docker compose -f infra/docker/compose.dev.yml up -d postgres pgbouncer redis temporal`.
- `pnpm db:migrate` reported an existing enum because the local database already
  had the schema applied. The runtime verification still succeeded against that
  existing schema.

## Residual Risk

- `Codex` and `Claude Code` remain outside the current runtime baseline and are
  still required for the final Release 1 cut.
- The full staging BYOK suite, k6 evidence, demo video, and release sign-off
  remain open.
- `api` workspace-wide lint still has unrelated pre-existing failures outside
  this slice; only the files touched in this turn were re-linted successfully.
