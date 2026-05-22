# Spec: Task 63 Local Agent Process Supervision

## Objective
Extend the desktop package so it can supervise user-configured local agent
processes, emit lifecycle audit events, and execute tool calls through the
shared tool runtime sandbox contract.

## Assumptions
- A process-launcher adapter is sufficient; CI does not need to spawn real
  long-lived OS child processes.
- Workspace audit integration can be represented as structured events the
  desktop shell would forward to the existing workspace audit pipeline.
- Tool calls should use `@agenthub/tool-runtime` rather than a desktop-local
  sandbox implementation.

## Commands
- Install/update workspace links: `pnpm install`
- Build: `pnpm --filter desktop build`
- Test: `pnpm --filter desktop test`
- Test: `pnpm test:e2e`

## Project Structure
- `apps/desktop/src/agent-supervisor.ts` → process lifecycle orchestration
- `apps/desktop/src/tool-bridge.ts` → sandboxed tool forwarding
- `apps/desktop/test/*.spec.ts` → unit coverage for supervisor + bridge
- `tests/e2e/desktop-agent-supervisor.spec.tsx` → root-level flow validation

## Code Style
Keep supervision state explicit and in-memory. Favor small interfaces for
process launchers and tool handlers so the package stays portable.

## Testing Strategy
- Unit-test start/stop audit emission and tool invocation routing.
- Add a root e2e spec that exercises supervisor + tool bridge together.

## Boundaries
- Always: stop duplicate launches for the same agent session.
- Ask first: persisting local agent credentials or secrets on disk.
- Never: bypass the shared sandbox when handling tool invocations.

## Success Criteria
- A configured local agent can be started and stopped through the supervisor.
- Lifecycle changes emit structured audit events with workspace scope.
- Tool invocations route through the shared `runSandboxed` contract.
- `pnpm --filter desktop test` and `pnpm test:e2e` both pass.
