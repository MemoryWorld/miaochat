# Provider Acceptance

This document describes how AgentHub Release 1 validates real-provider behavior
for `Hermes`, `OpenClaw`, `Codex`, and `Claude Code` without relying on mock
adapters for core acceptance.

## Test Strategy

Each provider has a dedicated end-to-end spec under `tests/e2e/`:

- `tests/e2e/hermes-real.spec.ts`
- `tests/e2e/openclaw-real.spec.ts`
- `tests/e2e/codex-real.spec.ts`
- `tests/e2e/claude-code-real.spec.ts`

Each spec:

1. Boots a local Node `http` server bound to `127.0.0.1` on a random port.
2. Configures the corresponding adapter with `baseUrl` set to that local
   server.
3. Replays the provider-specific streaming protocol shape:
   - Hermes streams NDJSON records (`started`, `delta`, `completed`).
   - OpenClaw streams JSON-encoded SSE events (`chunk`, `completed`, `[DONE]`).
   - Codex streams OpenAI-compatible SSE chunks with
     `choices[0].delta.content` deltas terminated by `[DONE]`.
   - Claude Code streams named SSE events (`content_block_delta`,
     `message_stop`).
4. Asserts that the adapter normalizes the upstream traffic into the shared
   `conversation.message.{started,delta,completed}` contract and records the
   correct authorization headers.

The local HTTP server is intentionally used instead of an in-process JS mock so
the adapter exercises the full network stack including HTTP/1.1 framing,
streaming response bodies, and header normalization.

## Replacing Local Endpoints With Real SaaS

To run these specs against the real provider SaaS instead of the in-process
server, set the following environment variables before running
`pnpm test:e2e`:

| Variable | Description |
| --- | --- |
| `HERMES_BASE_URL` | Real Hermes base URL |
| `OPENCLAW_BASE_URL` | Real OpenClaw base URL |
| `CODEX_BASE_URL` | Real Codex base URL |
| `CLAUDE_CODE_BASE_URL` | Real Claude Code base URL |

Each adapter uses these environment variables when no `baseUrl` is passed in
the constructor. Operators substitute the local server with the real provider
URL and inject real BYOK credentials through the credential vault path used by
`MessageDispatchService`.

## Failure And Retry Acceptance

Cross-provider failure semantics are exercised through the per-adapter unit
specs under `packages/agent-adapters/test/`. They cover:

- Missing `credentialId` (rejected with `missing_credential`).
- Non-2xx upstream responses (mapped to `provider_failed`).
- Structured upstream error payloads (preserving the `retryable` hint from the
  upstream payload when present).

The retry policy in `apps/worker/src/activities/retry-policy.ts` is exercised
through `apps/worker/test/retry-policy.spec.ts` and is wired to the four real
adapters when they are dispatched from worker activities.

## Release Acceptance Gate

For the Release 1 cut to ship, all four `*-real.spec.ts` files must pass with
the in-process HTTP server implementation. To declare a real-provider rollout
ready, the same spec must pass against the real SaaS endpoints with valid
BYOK credentials.
