# 2026-05-21 Application Skeletons

## Scope

- Completed `Task 11`
- Completed `Task 12`
- Completed `Task 13`

## Changes

- Stabilized root verification by fixing the API Nest decorator compile path for Vitest and by excluding Next-generated `next-env.d.ts` from ESLint.
- Added a package-local `apps/api/tsconfig.json` and updated API Vitest config so Nest controllers compile with legacy decorators and metadata in tests.
- Updated Web Vitest config to use the automatic JSX runtime so component tests match the app runtime.
- Fixed local Temporal development wiring in `infra/docker/compose.dev.yml` by switching the server driver to `postgres12`, adding explicit Temporal addresses, and mounting a checked-in dynamic config file.
- Added `infra/docker/temporal/dynamicconfig/development-sql.yaml` from the official Temporal local-compose baseline.
- Added the missing `@temporalio/workflow` dependency so the worker can bundle workflows during real startup.

## Verification

- `pnpm lint` passed.
- `pnpm test` passed.
- `pnpm build` passed.
- `timeout 20s pnpm --filter api dev` reached a clean Nest startup.
- `timeout 20s pnpm --filter worker dev` connected to Temporal, bundled workflows, entered `RUNNING`, and drained cleanly on timeout.
- `timeout 20s pnpm --filter web dev` reached a clean Next.js startup.
- `docker compose -f infra/docker/compose.dev.yml up -d --force-recreate temporal` passed.
- `docker compose -f infra/docker/compose.dev.yml ps` showed `postgres`, `redis`, `minio`, and `temporal` up.

## Notes

- Turborepo still emits a non-blocking warning that `/home/torch/AgentHub_multiagentcowork` is not inside a Git repository. This does not block local development or verification, but it will keep affecting dirty-hash cache messages until the repo boundary is corrected.
