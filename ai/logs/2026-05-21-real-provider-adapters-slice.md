# 2026-05-21 Real Provider Adapters Slice

## Scope

- Completed `Task 30` (Hermes), `Task 31` (OpenClaw), `Task 32` (Codex), and
  `Task 33` (Claude Code).

## Changes

- Added `packages/agent-adapters/src/shared/streaming-client.ts` with
  reusable helpers: `buildPromptMessages`, `jsonRequestInit`,
  `readResponseLines` (NDJSON, with a `keepEmptyLines` option used by the SSE
  parser), and `readServerSentEvents` (named-event aware). A
  `CredentialResolver` type captures the BYOK lookup contract every real
  adapter depends on.
- `packages/agent-adapters/src/hermes/{hermes-types,hermes-adapter}.ts`
  implements the Hermes NDJSON protocol. The adapter validates that the
  inbound `AgentExecutionRequest` carries both `provider === "hermes"` and a
  `credentialId`, calls the resolver to fetch the BYOK secret, sends the
  prompt to `/v1/messages/stream` with `Authorization: Bearer ...` and
  `Hermes-Account` headers, and translates `started`/`delta`/`completed`/`error`
  records into the shared streaming contract.
- `packages/agent-adapters/src/openclaw/{openclaw-types,openclaw-adapter}.ts`
  implements the OpenClaw SSE protocol (`chunk`/`completed`/`error` JSON
  payloads followed by `[DONE]`). The adapter targets `/v1/chat/completions`
  with `Authorization: Bearer ...` and `OpenClaw-Account` headers.
- `packages/agent-adapters/src/codex/{codex-types,codex-adapter}.ts` implements
  the OpenAI-compatible streaming protocol used by Codex. The adapter is
  configurable via `model` (defaulting to `process.env.CODEX_MODEL`) and
  forwards `Authorization: Bearer ...` and `Codex-Account` headers.
- `packages/agent-adapters/src/claude-code/{claude-code-types,claude-code-adapter}.ts`
  implements the Anthropic-style named-event SSE protocol. It accumulates
  `content_block_delta` text fragments, terminates on `message_stop`, and
  rejects empty responses as a retryable provider failure. It uses
  `X-Api-Key`, `Anthropic-Version`, and `Claude-Code-Account` headers.
- Each adapter throws an `AgentAdapterError` with a stable `code`
  (`provider_mismatch`, `missing_credential`, `provider_failed`) and a
  `retryable` hint that the worker retry policy honors.
- Updated `packages/agent-adapters/src/index.ts` to export every adapter,
  type, and the shared streaming helpers. The four BYOK validators in
  `apps/api/src/modules/credentials/providers/` already cover validation and
  remain the entry point used by `CredentialsService`.
- Added 12 unit tests across `hermes-adapter.spec.ts`, `openclaw-adapter.spec.ts`,
  `codex-adapter.spec.ts`, and `claude-code-adapter.spec.ts`. Each spec
  injects a fake fetch returning a `ReadableStream` body and asserts the
  normalized event sequence, the request URL, the request body shape, and
  the BYOK headers. Each spec also covers missing `credentialId` and upstream
  failure surfaces.

## Verification

- `pnpm --filter @agenthub/agent-adapters test` passed (15 tests across mock,
  hermes, openclaw, codex, and claude-code).

## Notes

- The adapters intentionally accept a `fetchImpl` constructor option so the
  worker can wire them to either `globalThis.fetch` or a Temporal-friendly
  HTTP client without changing the contract.
- Heading toward task 34 the same shared helper surface is reused by the
  in-process HTTP server fixtures, which keeps the test path identical to
  the production wire shape.
