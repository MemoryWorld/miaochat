# Task H-05: API Drizzle Migration

## Goal

Move the API's conversation, message, custom-agent, credential, and artifact
data access off direct `pg` queries and onto Drizzle.

## Constraints

- Existing API and integration behavior must stay stable.
- Raw `pg` access may remain only where Drizzle is not practical yet, such as
  migrations or unusual streaming/cursor paths.
- The migration needs to land incrementally because the affected modules span
  both feature services and helper services.

## Migration Slices

1. Add Drizzle access to `DatabaseService` without breaking existing callers.
2. Migrate repositories/services in this order:
   - conversations + group members + shares
   - messages + pin/regenerate helpers
   - custom agents
   - credentials + pool
   - artifacts + revisions/conflict detection
3. Remove direct `database.query()` usage from the target modules once each
   slice is green.

## Success Criteria

- `pnpm --filter api test` passes.
- `pnpm test:integration` passes.
- The targeted modules no longer issue direct `pg` queries.
