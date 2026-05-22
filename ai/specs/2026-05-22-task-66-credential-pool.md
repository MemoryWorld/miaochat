# Spec: Task 66 Credential Pool Data Model

## Objective

Persist platform-managed provider credentials in a shared pool so later
platform-managed mode and quota enforcement can select a provider credential
deterministically for a workspace without exposing secrets.

## Assumptions

1. This slice is API-internal only; no new HTTP endpoint is required yet.
2. Pool entries are global platform records rather than workspace-owned rows.
3. A pool entry is keyed by `provider`, `region`, `tier`, and `quotaClass`.
4. Selection determinism is workspace-scoped: the same workspace and pool key
   should resolve to the same active credential while the candidate set is
   unchanged.
5. Observability for selection means both structured logs and metrics.

## Commands

- Test: `pnpm --filter api test`
- Test: `DATABASE_URL=postgres://agenthub:agenthub@localhost:5432/agenthub_auth_test pnpm vitest run tests/integration/credential-pool.spec.ts`
- Build: `pnpm --filter api build`

## Project Structure

- `db/migrations/0016_credential_pool.sql`
- `db/schema.ts`
- `packages/contracts/src/credential-pool.ts`
- `apps/api/src/modules/credentials/pool.service.ts`
- `apps/api/test/credential-pool.e2e-spec.ts`
- `tests/integration/credential-pool.spec.ts`

## Code Style

- Reuse the existing credential secret encryption helpers and provider
  validators.
- Keep selection logic explicit and deterministic instead of relying on random
  DB ordering.
- Return structured selection metadata rather than leaking implementation-only
  hashes into callers.

## Testing Strategy

- Add an API-package test that exercises deterministic selection and
  observability through `CredentialPoolService`.
- Add an integration test that proves encrypted-at-rest persistence and keyed
  selection against PostgreSQL.
- Run the targeted integration test first, then the API package test, then the
  API build.

## Boundaries

- Always: store only encrypted secrets, keep `credentialSource` fixed to
  `platform_managed`, and filter selection to the requested pool key.
- Ask first: introducing a public admin API or persistent quota accounting in
  this task.
- Never: select from an unstable unordered candidate set or persist plaintext
  secrets.

## Success Criteria

1. Pool entries persist `provider`, `region`, `tier`, `quotaClass`, and
   encrypted secret material.
2. Selection for a given workspace and pool key is deterministic across calls
   while the pool contents remain unchanged.
3. Selection emits structured logs and metrics for hit/miss outcomes.
4. The contract is ready for later quota enforcement and platform-managed mode
   switching without breaking the BYOK path.
