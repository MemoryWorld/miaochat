# Spec: Task 68 Mode Switch Surface

## Objective

Let a workspace owner opt a provider into `platform_managed` mode when policy
allows, while keeping BYOK as the default path and preserving the Release 1
credential onboarding flow.

## Assumptions

1. BYOK remains the default when no workspace/provider mode override exists.
2. Platform-managed mode enablement is allowed only when a provider has an
   available credential-pool entry and quota policy support.
3. The mode switch is a workspace-scoped setting distinct from stored BYOK
   credentials.
4. The UI can use a dedicated mode endpoint rather than overloading the BYOK
   credential create contract.

## Commands

- Test: `pnpm --filter web test`
- Test: `pnpm test:e2e`
- Test: `pnpm --filter api test`
- Build: `pnpm --filter api build`

## Project Structure

- `db/migrations/0018_workspace_provider_credential_modes.sql`
- `db/schema.ts`
- `apps/api/src/modules/credentials/credentials.service.ts`
- `apps/api/src/modules/credentials/credentials.controller.ts`
- `apps/web/src/features/setup/credential-mode-toggle.tsx`
- `apps/web/src/features/setup/setup-flow.tsx`
- `apps/api/test/credential-mode.e2e-spec.ts`
- `tests/e2e/credential-mode-switch.spec.tsx`

## Code Style

- Keep BYOK logic untouched unless the selected mode is explicitly
  `platform_managed`.
- Persist the mode separately from BYOK credentials to avoid leaking
  platform-managed semantics into the existing secret storage path.
- Use small UI state changes rather than rebuilding the whole setup flow.

## Testing Strategy

- Extend web unit coverage for the new toggle and platform-managed save path.
- Add an API e2e test that proves policy-gated mode switching works end-to-end.
- Add a focused e2e/UI spec for the user-facing mode change.

## Boundaries

- Always: default to BYOK, require auth + workspace permission checks, and gate
  platform-managed mode on current policy availability.
- Ask first: replacing the BYOK setup flow or forcing platform-managed mode as
  the default.
- Never: store platform-managed mode inside a fake BYOK secret row.

## Success Criteria

1. A workspace/provider mode override can be saved as `platform_managed` when
   policy allows.
2. Switching back to `user_provided` removes the override and restores the
   default BYOK path.
3. Existing BYOK onboarding specs still pass unchanged in behavior.
4. The setup UI makes the active mode explicit and routes actions to the proper
   backend flow.
