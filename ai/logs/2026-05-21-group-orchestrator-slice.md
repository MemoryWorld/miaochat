# 2026-05-21 Group Orchestrator Slice

## Scope

- Completed `Task 21`

## Changes

- Added a shared orchestration-state helper in `@agenthub/domain` so the worker can record deterministic `received -> dispatched -> running -> aggregated` transitions and surface them as normalized `conversation.status` events.
- Added `dispatchAgentActivity` and `aggregateResultsActivity` plus a new `groupOrchestratorWorkflow` that fans one group message out to multiple agent targets in parallel and folds the results back into one assistant reply.
- Extended the API message-dispatch service so `/messages/send` now accepts `mode=group`, narrows dispatch to `mentionedAgentIds` when present, and persists one aggregated assistant message after the Temporal workflow completes.
- Relaxed assistant-message persistence to allow `sourceAgentId = null`, which matches the new aggregated group reply shape.
- Added worker, domain, and integration coverage for untargeted group orchestration, explicit single-member targeting, status-event emission, and aggregated persistence reload.
- Exposed a focused `@agenthub/domain/orchestration` export so the Temporal workflow bundle only pulls deterministic orchestration code instead of the full domain surface.

## Verification

- `pnpm --filter @agenthub/domain test` passed.
- `pnpm --filter worker test` passed.
- `pnpm test:integration` passed.
- `pnpm test:e2e` passed.
- `pnpm lint` passed.
- `pnpm test` passed.
- `pnpm build` passed.

## Notes

- Temporal workflow bundling cannot safely depend on the root `@agenthub/domain` export because that path also reaches credential code using `node:crypto`; group workflows should keep importing the focused `@agenthub/domain/orchestration` subpath.
- `Task 22` is now the next dependency-critical slice: partial-failure, timeout, and downgrade handling for group chat.
