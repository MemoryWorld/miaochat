# Spec: Task 59 Deploy Workflow

## Assumptions

1. `Task 59` remains worker-first; chat command dispatch and deploy status cards
   stay in `Task 60`.
2. The deployment workflow runs directly on Temporal as
   `deployArtifactWorkflow`.
3. Deployment persistence is a worker concern for this slice, using the same
   PostgreSQL database as the API.
4. `static-site` and `container` use dedicated activities; `source-archive`
   can complete through an inline workflow branch because it does not need an
   external provider stub yet.
5. Progress events are persisted as structured JSON in the deployment record so
   later UI work can render the timeline without changing the workflow result
   shape.

## Objective

Turn deploy targets into executable worker jobs. Given an artifact and a deploy
target, the worker should create a deployment record, emit a normalized
progress timeline, run the target-specific deploy stub, and persist the final
result.

## Commands

- Worker tests: `pnpm --filter worker test`
- Integration test:
  `DATABASE_URL=postgres://agenthub:agenthub@localhost:5432/agenthub_auth_test pnpm vitest run tests/integration/deploy-workflow.spec.ts`
- Build: `pnpm --filter worker build`

## Project Structure

- `db/migrations/0015_deployments.sql`: deployment record persistence
- `packages/contracts/src/deployment.ts`: deployment + progress schemas
- `apps/worker/src/workflows/deploy-artifact.workflow.ts`: orchestration
- `apps/worker/src/activities/deploy-*.activity.ts`: target-specific worker
  execution and persistence helpers
- `apps/worker/test/deploy-artifact.workflow.spec.ts`: workflow branch/unit
  coverage
- `tests/integration/deploy-workflow.spec.ts`: Temporal + DB proof

## Testing Strategy

- Start with a workflow unit test that proves the correct activity branch and
  progress sequence.
- Add one integration spec that provisions a real deploy target + artifact,
  runs the Temporal worker, and verifies the `deployments` table.
- Verify worker package tests, worker build, and the focused integration spec
  before broader suites.

## Success Criteria

1. `deployArtifactWorkflow` creates a deployment record before execution.
2. The workflow records a structured progress sequence with at least
   `deployment.received`, `deployment.running`, and a terminal event.
3. `static-site` and `container` deploys are handled by dedicated activities.
4. The final deployment record is persisted with status, target kind, result
   message, and progress events.
