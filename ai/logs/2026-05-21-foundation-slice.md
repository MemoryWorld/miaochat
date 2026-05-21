# 2026-05-21 Foundation Slice

## Scope

- Implemented `Task 01`
- Partially implemented `Task 02`
- Implemented `Task 03`

## Changes

- Added workspace root tooling with `pnpm workspace`, `turbo`, root scripts, base TypeScript config, root ESLint config, and ignore rules.
- Added the `@agenthub/config` package with shared ESLint, TypeScript, and Vitest defaults plus a small proof test.
- Added local environment templates for `web`, `api`, and `worker`.
- Added a Docker Compose development file for `PostgreSQL`, `Redis`, `Temporal`, and `MinIO`.
- Added a PostgreSQL init script that creates both `agenthub` and `temporal` databases on first boot.

## Verification

- `pnpm install` passed.
- `pnpm exec turbo run lint --force` passed.
- `pnpm build` passed.
- `pnpm test` passed.
- `docker compose -f infra/docker/compose.dev.yml config` passed.

## Remaining Work

- `Task 02` is not fully complete yet because a real `docker compose up -d postgres redis temporal minio` run was stopped during first-time image pulling. The compose file parses correctly, but runtime boot still needs a clean full verification pass.
