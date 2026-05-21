# 2026-05-21 Tool Runtime Slice

## Scope

- Completed `Task 24`

## Changes

- Added a new workspace package `@agenthub/tool-runtime` with a focused `ToolRegistry` and `ToolLoader` so heavy custom-agent tool extensions can be resolved through one runtime boundary instead of provider-specific code paths.
- Implemented server-side tool registration as an in-memory registry keyed by tool name, with duplicate-name rejection and stable list semantics.
- Implemented config-file loading for tool bindings, including relative-path resolution, manifest validation, and normalized loaded-tool output for both `config_file` and `server_registration` bindings.
- Added `ToolRegistrationService` and `ToolsModule` in the API so custom-agent tool bindings can be resolved by `(agentId, workspaceId)` directly from persisted `tool_bindings`.
- Wired the new tools module into `AppModule` without adding a public HTTP surface yet; this keeps the runtime boundary available to later slices without prematurely freezing an external API.
- Added package-level unit coverage for mixed binding resolution and service-level integration coverage that creates a custom agent, registers a server tool, and resolves both tool sources end-to-end.
- Refreshed the workspace lockfile with `pnpm install` so the new `@agenthub/tool-runtime` package is linked correctly across the monorepo.

## Verification

- `pnpm --filter @agenthub/tool-runtime test` passed.
- `pnpm --filter api test` passed.
- `pnpm test:integration` passed.

## Notes

- The current runtime only resolves tool metadata and entry boundaries; actual tool execution remains a later concern.
- `Task 25` is now the next dependency-critical slice: web flows for custom-agent creation and selection.
