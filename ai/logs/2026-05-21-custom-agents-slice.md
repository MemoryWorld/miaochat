# 2026-05-21 Custom Agents Slice

## Scope

- Completed `Task 23`

## Changes

- Added a dedicated `custom-agents` API module with `POST /custom-agents` and `GET /custom-agents`, wired into `AppModule` and backed by the shared `@agenthub/contracts` schemas.
- Implemented `CustomAgentsService` so light custom agents are persisted with `name`, `avatarUrl`, `capabilityTags`, `provider`, `systemPrompt`, and `toolBindings`, then listed newest-first within a workspace.
- Added e2e and integration coverage for custom-agent creation and listing, including persisted tool-binding payloads and workspace-scoped reads.
- Prepared `db/migrations/0003_custom-agents.sql` to move `custom_agents` onto a workspace-scoped primary key and add registry indexes for workspace/name, workspace/created_at, and workspace/provider access patterns.
- Updated the Drizzle schema for `custom_agents` to match the workspace-scoped primary-key model used by the migration.
- Normalized custom-agent seed inserts to `ON CONFLICT DO NOTHING` so the SQL stays compatible before and after the workspace-scoped key migration lands.
- Removed a hidden cross-workspace test collision between group orchestration suites by giving their mock Hermes agents distinct ids; this exposed why workspace-scoped custom-agent identity needs to be enforced at the schema level.

## Verification

- `pnpm --filter api test` passed.
- `pnpm test:integration` passed.

## Notes

- The repository now includes the migration for workspace-scoped custom-agent identity, but I did not run `pnpm db:migrate` in the local database during this slice.
- `Task 24` is now the next dependency-critical slice: tool registry and server-side extension loading.
