# Hardening Track Slice

## Scope

Closed the remaining hardening-track roadmap items:

- `H-05` Drizzle migration
- `H-06` `pgBouncer`
- `H-07` Tailwind + shadcn-style baseline
- `H-08` Playwright browser e2e
- `H-09` Supertest contract coverage
- `H-10` staging-only provider acceptance and k6 runner wiring

## What Landed

- Finished the Drizzle migration for conversations, messages, custom agents,
  credentials, and artifacts, with contract coverage protecting the new
  authenticated ownership boundaries.
- Added `pgBouncer` to Docker and Kubernetes manifests and switched the example
  `DATABASE_URL` defaults to the pooler port.
- Wired Tailwind CSS into `apps/web`, added shared tokens and UI primitives,
  and migrated the main chat / setup / agents shells onto utility-class-based
  styling.
- Replaced the top-level browser e2e entrypoint with Playwright while keeping
  the existing `tests/e2e/*.spec.tsx` files as smoke tests.
- Added a staging runner plus GitHub Actions workflow for real-provider
  acceptance and k6 load scenarios. The committed local evidence is a dry-run
  plus script/workflow validation because this workstation does not have the
  staging secrets.

## Verification

- `DATABASE_URL=postgres://agenthub:agenthub@localhost:6432/agenthub_h05_test pnpm --filter api test test/auth.contract-spec.ts test/workspaces.contract-spec.ts test/messages.contract-spec.ts test/artifacts.contract-spec.ts test/credentials.contract-spec.ts`
- `pnpm --filter web test`
- `pnpm --filter web build`
- `pnpm test:e2e:smoke`
- `pnpm test:e2e`
- `AGENTHUB_STAGING_DRY_RUN=1 pnpm test:e2e:staging`

## Residual Risk

- The staging acceptance workflow is ready, but a true external run still
  depends on secrets-backed CI and seeded conversation ids for the k6
  scenarios.
