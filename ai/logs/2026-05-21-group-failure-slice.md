# 2026-05-21 Group Failure Slice

## Scope

- Completed `Task 22`

## Changes

- Added a dedicated `orchestrator-event` contract so `conversation.status` events can carry normalized status labels, agent counts, and structured per-agent failure metadata for group chat.
- Extended the orchestration-state helper to record failure details, emit deterministic `partial_failure` and degraded `aggregated` summaries, and keep the worker-side status timeline stable even when one or more sub-agents fail.
- Added mock failure/timeout handling in the worker activities so the group orchestrator can continue after individual dispatch faults, normalize them into structured failure entries, and append a downgrade notice to the final assistant reply.
- Added a `SystemStatusCard` to the web chat timeline so partial-failure and degraded aggregate states are rendered as first-class system events instead of being buried inside raw assistant text.
- Fixed the chat experience stream-consumption path to process all newly received SSE events instead of only the latest one, which prevents synchronous `started -> delta -> completed` bursts from dropping the assistant reply during React batching.
- Added worker, integration, and e2e coverage for mixed success/failure group runs, including structured failure payloads, deterministic final aggregation, and degraded UI rendering.

## Verification

- `pnpm --filter @agenthub/contracts test` passed.
- `pnpm --filter @agenthub/domain test` passed.
- `pnpm --filter worker test` passed.
- `pnpm exec vitest run tests/integration/group-failure.spec.ts` passed.
- `pnpm --filter web test` passed.
- `pnpm test:e2e` passed.

## Notes

- `conversation.status` is now effectively a typed orchestrator event channel; follow-on slices should extend `packages/contracts/src/orchestrator-event.ts` instead of widening the generic stream-event union inline.
- `Task 23` is now the next dependency-critical slice: custom-agent registry and persistence.
