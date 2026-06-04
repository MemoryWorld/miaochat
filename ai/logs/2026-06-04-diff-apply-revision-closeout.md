# 2026-06-04 Diff Apply Revision Closeout

## Context

`docs/product/original-requirements.md` explicitly requires message operations to include one-click Diff application. The previous chat action only showed a location hint, while the rich Diff card only tracked local hunk decisions.

## Changes

- Added a shared `digestSha256` helper for browser and jsdom digest calculation.
- Reused the helper in the artifact code editor and the new Diff apply flow.
- Changed message-level `应用 Diff` into an async action that reads the diff artifact preview, computes a digest, and posts a new artifact revision.
- Kept the boundary explicit: this records an accepted artifact revision; it does not mutate the user's local git worktree.
- Extended e2e coverage to assert the revision POST payload and user-visible success status.

## Verification

- `./node_modules/.bin/vitest run --no-file-parallelism tests/e2e/message-actions.spec.tsx tests/e2e/artifact-cards.spec.tsx tests/e2e/artifact-code-editor.spec.tsx apps/web/src/features/chat/chat-message.spec.tsx apps/web/src/features/chat/chat-experience.spec.tsx` -> 15 passed.
- `./node_modules/.bin/tsc -p apps/web/tsconfig.json --noEmit --pretty false` -> passed.
- Focused ESLint for changed web/test files -> passed.
