# Task H-04: Redis-backed Rate Limiting

## Goal

Move `RateLimitService` off in-process `Map` storage and onto Redis so rate-limit
decisions survive across API instances. Keep an in-memory implementation
available as a test double.

## Scope

- Add a Redis repository for fixed-window rate-limit buckets.
- Convert `RateLimitService` to use an injected repository abstraction.
- Keep an in-memory repository available for tests and local overrides.
- Prove Redis sharing with tests that hit two app instances in one scenario.

## Design

- `RateLimitService` remains the caller-facing API but becomes async for
  `consume()` and `reset()`.
- `LimitsModule` provides either:
  - `RedisRateLimitRepository` in runtime by default
  - `InMemoryRateLimitRepository` when tests or explicit env overrides request it
- Redis keys use a configurable prefix so tests can isolate their buckets.
- `reset()` clears only keys inside that prefix.

## Success Criteria

- Message send and auth rate-limit flows still return the same public 429 shape.
- Two API app instances see the same bucket state when Redis mode is enabled.
- `pnpm --filter api test` passes.
- `pnpm test:integration` passes.
