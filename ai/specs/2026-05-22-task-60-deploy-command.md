# Spec: Task 60 Deploy Command And Status Card

## Objective
Let a workspace user trigger a deployment from the chat composer with
`/deploy <target>`. The system should resolve the latest artifact in the
selected conversation, run the existing deploy workflow against the named
target, and render a deploy status card in the chat timeline linked to that
artifact.

## Assumptions
- Deploy dispatch can be synchronous for this slice because the current worker
  activities complete quickly in tests.
- The "artifact under discussion" is the most recently created artifact in the
  selected conversation.
- Deploy execution requires `deploy_target.manage` on the workspace because it
  mutates external infrastructure.

## Commands
- Build: `pnpm --filter api build`
- Test: `pnpm --filter web test`
- Test: `pnpm test:e2e`
- Optional focused test: `pnpm vitest run tests/e2e/deploy-command.spec.tsx`

## Project Structure
- `packages/contracts/src/*` → shared deploy command request/response schemas
- `apps/api/src/modules/deploys/*` → dispatch endpoint and workflow trigger
- `apps/web/src/features/chat/*` → composer command parsing and request routing
- `apps/web/src/features/artifacts/*` → deploy status card rendering
- `tests/e2e/*` → UI-level mocked fetch coverage for the command flow

## Code Style
Keep the implementation thin and explicit: parse the command once, branch early,
and return a single response shape the UI can render without extra fetches.

## Testing Strategy
- Add a small web unit test for command parsing.
- Add a mocked jsdom e2e spec covering `/deploy <target>` dispatch and status
  card rendering.
- Run `pnpm --filter web test` and `pnpm test:e2e` after the slice lands.

## Boundaries
- Always: reuse the existing deploy workflow and current inline-style UI
  patterns.
- Ask first: introducing background polling or a new live deploy event stream.
- Never: store raw deploy secrets in any web-visible response.

## Success Criteria
- `/deploy Marketing Preview` in the composer does not call `/messages/send`.
- The client calls a deploy dispatch endpoint with conversation and workspace
  context.
- The endpoint resolves the latest artifact in the conversation, runs
  `deployArtifactWorkflow`, and returns deployment + artifact + target summary.
- The chat thread renders a deploy status card showing target, artifact, and
  resulting deployment status.
