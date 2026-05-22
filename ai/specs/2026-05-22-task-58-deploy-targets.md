# Spec: Task 58 Deploy Targets

## Assumptions

1. Release 4 starts with an API-only slice; web chat deploy dispatch remains Task 60.
2. Deploy targets are exposed under `POST /deploys/targets` and `GET /deploys/targets`.
3. The existing `credential_source` abstraction is reused as-is:
   `user_provided` and `platform_managed`.
4. A deploy target may omit a secret when the target kind does not need one
   immediately (for example source-archive download flows), but any supplied
   secret must be encrypted at rest and never returned by the API.
5. Permission enforcement matches other workspace-scoped configuration
   resources: `deploy_target.manage` for writes and `deploy_target.read` for
   reads.

## Objective

Persist workspace-scoped deploy targets so Release 4 can dispatch real deploy
workflows in Task 59 without inventing configuration on the fly. The API must
support the three deferred publish modes from the product requirements:
`static-site`, `container`, and `source-archive`.

## Commands

- Build: `pnpm --filter api build`
- API tests: `pnpm --filter api test`
- Integration test: `DATABASE_URL=postgres://agenthub:agenthub@localhost:5432/agenthub_auth_test pnpm vitest run tests/integration/deploy-targets.spec.ts`

## Project Structure

- `packages/contracts/src/deploy-target.ts`: shared deploy-target schemas
- `db/migrations/0014_deploy_targets.sql`: persistence for deploy targets
- `db/schema.ts`: Drizzle schema mirror
- `apps/api/src/modules/deploys/*`: Nest module, controller, service, DTO
- `tests/integration/deploy-targets.spec.ts`: end-to-end API proof

## Code Style

- Reuse the repo's existing NestJS + Zod controller/service pattern.
- Keep persistence SQL explicit inside the API service, matching current
  workspace/credential modules.
- Follow the credential module's secret handling model: encrypt before insert,
  omit from public DTOs.

## Testing Strategy

- Start with an integration test that signs up a user, creates a workspace,
  persists deploy targets, and verifies the DB row stores encrypted secrets.
- Use API assertions for the external contract and direct SQL assertions only
  for encrypted-at-rest proof.
- Run targeted integration first, then `pnpm --filter api test`, then build.

## Boundaries

- Always: enforce auth, enforce workspace permission checks, keep secrets out
  of JSON responses.
- Ask first: adding external deploy-provider SDKs or new infrastructure
  services.
- Never: store deploy secrets in plaintext or bypass workspace scoping.

## Success Criteria

1. `POST /deploys/targets` creates workspace-scoped deploy targets for
   `static-site`, `container`, and `source-archive`.
2. `credentialSource` is persisted using the same enum contract as provider
   credentials.
3. When `rawSecret` is supplied, the DB stores only encrypted material.
4. `GET /deploys/targets` returns metadata only and never returns
   `rawSecret` or `encryptedSecret`.
