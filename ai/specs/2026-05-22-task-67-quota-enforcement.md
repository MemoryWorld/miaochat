# Spec: Task 67 Per-Workspace Quota Enforcement

## Objective

Track workspace consumption of platform-managed provider credentials, enforce a
period-based quota, surface breaches as `quota_exceeded`, and keep renewal
times queryable for later automation.

## Assumptions

1. Quota accounting is internal-only in this slice; no new HTTP endpoint is
   required.
2. Usage is tracked in integer request units rather than provider-specific
   token counts for now.
3. Policies can stay in-memory and test-configurable until the mode-switch
   surface lands in Task 68.
4. Renewal scheduling can be represented by persisted `renewsAt` timestamps and
   a queryable service method.

## Commands

- Test: `pnpm --filter api test`
- Test: `DATABASE_URL=postgres://agenthub:agenthub@localhost:5432/agenthub_release6_quota_test pnpm vitest run tests/integration/quota-enforcement.spec.ts`
- Build: `pnpm --filter api build`

## Project Structure

- `db/migrations/0017_workspace_provider_quota_periods.sql`
- `db/schema.ts`
- `apps/api/src/modules/quota/quota.service.ts`
- `apps/api/src/modules/quota/quota.module.ts`
- `packages/domain/src/errors/public-error-mapper.ts`
- `apps/api/test/quota.e2e-spec.ts`
- `tests/integration/quota-enforcement.spec.ts`

## Code Style

- Keep quota policy and quota ledger concerns inside a dedicated service.
- Use explicit period math and persisted period rows instead of implicit cache
  timers.
- Throw a typed quota error so public error mapping stays deterministic.

## Testing Strategy

- Add an API-package test for service behavior, breach mapping, and renewal
  discovery.
- Add an integration test that proves usage is persisted per provider and per
  period in PostgreSQL.
- Extend the shared public-error mapper integration test for the new code.

## Boundaries

- Always: record workspace/provider usage in persisted period rows and map quota
  breaches to `quota_exceeded`.
- Ask first: introducing billing, pricing, or provider-native token telemetry.
- Never: silently over-consume a quota-limited platform-managed credential.

## Success Criteria

1. Usage for a workspace/provider is persisted in a current quota period row.
2. Crossing the configured limit throws a typed quota error that maps to
   `quota_exceeded`.
3. Renewal times are persisted and queryable so later jobs can process them.
4. Advancing beyond a finished period creates or uses a new period row rather
   than mutating the expired one.
