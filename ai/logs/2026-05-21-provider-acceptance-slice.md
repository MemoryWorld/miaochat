# 2026-05-21 Provider Acceptance Slice

## Scope

- Completed `Task 34`

## Changes

- Added `tests/e2e/hermes-real.spec.ts`. It spins up a Node `http` server
  bound to `127.0.0.1` on a random port, configures the `HermesAdapter` with
  that local `baseUrl`, replays the NDJSON streaming protocol (`started`,
  three `delta` records, and a `completed` record), and asserts the adapter
  produces the normalized lifecycle events plus the correct
  `Authorization: Bearer ...` and `Hermes-Account` headers.
- Added `tests/e2e/openclaw-real.spec.ts` driving the `OpenClawAdapter`
  through an SSE stream of `chunk`/`completed`/`[DONE]` events. Verifies the
  request body shape, the `Authorization` and `OpenClaw-Account` headers, and
  the normalized streaming output.
- Added `tests/e2e/codex-real.spec.ts` driving the `CodexAdapter` through an
  OpenAI-compatible SSE stream of `choices[0].delta.content` chunks
  terminated by `[DONE]`. Verifies the snake-case body keys, the
  `Authorization` and `Codex-Account` headers, and the normalized streaming
  output.
- Added `tests/e2e/claude-code-real.spec.ts` driving the `ClaudeCodeAdapter`
  through a named-event SSE stream of `content_block_delta` events terminated
  by `message_stop`. Verifies the `X-Api-Key`, `Anthropic-Version`, and
  `Claude-Code-Account` headers, plus the normalized streaming output.
- Added `docs/operations/provider-acceptance.md` describing the strategy, how
  the in-process replay server stands in for real SaaS endpoints, the
  environment variables (`HERMES_BASE_URL`, `OPENCLAW_BASE_URL`,
  `CODEX_BASE_URL`, `CLAUDE_CODE_BASE_URL`) that swap to real providers, the
  cross-provider failure semantics covered by the unit specs, and the
  release acceptance gate.

## Verification

- `pnpm test:e2e` passed (10 tests, including the four new real-provider
  acceptance specs and the six existing UI specs).

## Notes

- Using a Node HTTP server keeps the adapters on the production code path
  (real fetch, real streaming) while staying CI-friendly. Operational sign-off
  swaps the local server for the real provider URLs without changing the spec.
- The four specs share a similar shape but stay self-contained because each
  provider has a distinct streaming protocol; consolidating them would only
  obscure the per-provider expectations.
