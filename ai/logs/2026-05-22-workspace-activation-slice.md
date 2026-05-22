# 2026-05-22 Workspace Activation Slice

## Scope

- Completed `Task 40` (Activate the workspace entity end-to-end) from
  `ai/tasks/post-release-1-roadmap-tasks.md` Phase 12 of Release 2.

## Changes

- `db/migrations/0007_workspaces.sql` creates the `workspaces` table with
  composite primary key `(owner_user_id, id)`, FK to `users(id) ON DELETE
  CASCADE`, an `(owner_user_id, created_at, id)` ordering index, and idempotent
  seeding logic that:
  - inserts a `default-workspace` row for every existing user, and
  - backfills any `workspace_id` already present in `conversations`,
    `messages`, `provider_credentials`, or `custom_agents` whose
    `owner_user_id` joins a real `users` row (orphans with the legacy
    `system-user` placeholder are skipped to avoid FK violations).
- `db/schema.ts` adds the `workspaces` Drizzle table with the same composite
  PK and FK so future Drizzle-based queries see the entity.
- `apps/api/src/modules/workspaces/`:
  - `workspaces.controller.ts` exposes `POST /workspaces` (create) and
    `GET /workspaces` (list), both gated through
    `AuthService.requireAuthenticatedUser` so the operations are scoped to
    the calling user.
  - `workspaces.service.ts` provides `create`, `list`, and `ensureWorkspace`.
    `list` defensively upserts the user's `default-workspace` so the API
    surface is never empty for an authenticated user.
  - `workspaces.module.ts` registers the controller/service and `forwardRef`s
    `AuthModule` to break the circular import.
- `apps/api/src/app.module.ts` wires `WorkspacesModule` into the root module
  so the `/workspaces` routes are mapped.
- `apps/api/src/modules/auth/auth.service.ts` provisions
  `default-workspace` for every newly registered user inside the existing
  signup transaction (inline SQL UPSERT, avoiding a circular dependency on
  `WorkspacesService`). Added `DEFAULT_WORKSPACE_ID` and
  `DEFAULT_WORKSPACE_NAME` constants alongside the session constants.
- `tests/integration/workspaces-api.spec.ts` covers the end-to-end slice:
  signup → assert `default-workspace` listed → `POST /workspaces` to create
  `workspace_launch_ops` → exercise `custom-agents`, `credentials`,
  `conversations`, `messages`, `artifacts/upload-target`, and `artifacts`
  scoped to that workspace → assert that the `workspaces` table contains both
  rows for the user, and that every scoped table records the expected
  `workspace_id`.

## Verification

- `pnpm --filter api test` — 6 files / 11 tests passed.
- `pnpm test:integration` — 17 files / 30 tests passed (including
  `tests/integration/workspaces-api.spec.ts`).

## Notes

- The `workspaces` table is a metadata registry. Existing scope-aware tables
  (conversations, messages, custom_agents, provider_credentials, artifacts)
  retain their `workspace_id` column without an enforced FK to keep the
  Release 1 acceptance flows green; Task 43+ will add explicit role/permission
  enforcement on top of this entity.
- The seed clause in the migration only backfills workspace rows for
  `owner_user_id` values that actually exist in `users`; the migration is
  idempotent so re-running it after a fresh `pnpm db:migrate` is safe.
- Default-workspace provisioning at signup uses inline SQL inside the
  existing transaction to avoid pulling `WorkspacesService` (and therefore
  `WorkspacesModule`) into `AuthModule`, which already participates in the
  forwardRef relationship from the workspaces side.
