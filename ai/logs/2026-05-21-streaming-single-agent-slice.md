# 2026-05-21 Streaming And Single-Agent Slice

## Scope

- Completed `Task 17`
- Completed `Task 18`

## Changes

- Added an in-memory API stream broker plus `/streams/:conversationId` SSE endpoint so browsers can subscribe to normalized conversation events without polling.
- Added a browser `useConversationStream` hook and validated the monorepo workspace package path so the web app can consume shared stream contracts in both Vitest and Next.js builds.
- Introduced `/messages/send` as the single-agent dispatch path: it persists the user message, resolves the direct mock agent binding, and starts a worker-owned `singleAgentWorkflow` through Temporal.
- Added the mock worker workflow using the shared mock direct adapter, then remapped streamed message IDs back to persisted assistant messages before publishing to the browser stream.
- Replaced the root web placeholder with a minimal chat experience that can create a seeded mock conversation, send a prompt, render live SSE output, and refresh persisted assistant replies.
- Extended local seed data with a default `agent_mock` entry so the mock chat slice has a stable development path after `pnpm db:seed`.

## Verification

- `pnpm --filter api test` passed.
- `pnpm --filter web test` passed.
- `pnpm --filter worker test` passed.
- `pnpm test:integration` passed.
- `pnpm test:e2e` passed.
- `pnpm test` passed.
- `pnpm lint` passed.
- `pnpm build` passed.

## Notes

- The single-agent mock slice now depends on local `PostgreSQL` and `Temporal` being available for integration verification.
- `Task 19` remains the next dependency-critical slice: pinned messages are persisted already, but they are not yet assembled into provider execution context.
