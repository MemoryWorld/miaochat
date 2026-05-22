# Spec: Task 62 Desktop Application Shell

## Objective
Create a minimal desktop package that models an Electron-style shell around the
existing web app. The shell must expose:
- a window definition that embeds the current web client URL,
- a system-notification bridge,
- a local file-picker bridge that returns upload-ready file descriptors.

## Assumptions
- A testable shell manifest is sufficient for this slice; we do not need to
  launch a real desktop runtime inside CI.
- Electron-style abstractions are acceptable because the roadmap allows either
  Tauri or Electron.
- The existing artifact upload flow can consume normalized local-file metadata
  without native streaming in this task.

## Commands
- Build: `pnpm --filter desktop build`
- Test: `pnpm --filter desktop test`

## Project Structure
- `apps/desktop/src/main.ts` → shell manifest and app factory
- `apps/desktop/src/system-notifications.ts` → notification bridge
- `apps/desktop/src/file-bridge.ts` → local file picker bridge
- `apps/desktop/test/system-notifications.spec.ts` → shell/bridge tests

## Code Style
Keep the desktop slice declarative. Export plain objects and small classes so
the package stays runnable in CI without a native desktop dependency.

## Testing Strategy
- Verify the shell points at the web entry URL and keeps safe browser defaults.
- Verify approval/system notifications generate stable titles and payloads.
- Verify file picker results normalize into artifact-upload descriptors.

## Boundaries
- Always: keep the browser sandbox on and node integration off.
- Ask first: introducing real Electron/Tauri binary dependencies.
- Never: couple the desktop package directly to API credentials or secrets.

## Success Criteria
- `pnpm --filter desktop build` succeeds.
- `pnpm --filter desktop test` passes.
- The shell factory returns a desktop manifest that embeds the web app URL.
- The notification bridge emits a structured desktop notification payload.
- The file bridge converts local paths into upload-ready descriptors.
