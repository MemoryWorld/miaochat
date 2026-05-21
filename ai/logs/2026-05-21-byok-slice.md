# 2026-05-21 BYOK Slice

## Scope

- Completed `Task 14`
- Completed `Task 15`

## Changes

- Extended the domain credential boundary to support validation-only checks, workspace listing, and revocation in addition to encrypted creation and secret reveal.
- Added an API database module backed by a reusable `pg` pool for future conversation and artifact modules.
- Implemented `/credentials` create, validate, list, and revoke endpoints in `apps/api`, with explicit no-secret response mapping and provider-specific local validators for `Codex`, `Claude Code`, `Hermes`, and `OpenClaw`.
- Added API e2e and root integration coverage that proves credential validation does not persist secrets, persisted secrets remain encrypted, and revoke removes workspace-scoped records.
- Replaced the placeholder setup route in `apps/web` with a guided BYOK onboarding flow that lets the user choose a provider, enter credential details, validate the secret, save it, and see the bound credential list.
- Added web unit coverage for the setup flow and a root e2e-style jsdom flow for the guided onboarding path.
- Added a root `vitest.config.ts` plus the minimal root-level front-end testing dependencies needed to keep `pnpm test:e2e` meaningful.

## Verification

- `pnpm --filter @agenthub/domain test` passed.
- `pnpm --filter api test` passed.
- `pnpm --filter api build` passed.
- `pnpm test:integration` passed.
- `pnpm --filter web test` passed.
- `pnpm --filter web build` passed.
- `pnpm test:e2e` passed.
- `pnpm lint` passed.
- `pnpm build` passed.
- `pnpm test` passed.

## Notes

- Root Vitest now has an explicit config so jsdom-based e2e-style tests can coexist with node-based integration tests.
- The non-blocking Turborepo warning about the directory not being inside a Git repository remains unchanged.
