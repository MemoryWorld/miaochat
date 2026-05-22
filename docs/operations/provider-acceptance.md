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
server, set `AGENTHUB_REAL_PROVIDER_MODE=staging` and provide the following
environment variables before running `pnpm test:e2e:providers` or
`pnpm test:e2e:staging`:

| Variable | Description |
| --- | --- |
| `HERMES_BASE_URL` | Real Hermes base URL |
| `HERMES_REAL_ACCOUNT_ID` | Rotated Hermes BYOK account id for staging |
| `HERMES_REAL_SECRET` | Rotated Hermes BYOK secret for staging |
| `OPENCLAW_BASE_URL` | Real OpenClaw base URL |
| `OPENCLAW_REAL_ACCOUNT_ID` | Rotated OpenClaw BYOK account id for staging |
| `OPENCLAW_REAL_SECRET` | Rotated OpenClaw BYOK secret for staging |
| `CODEX_BASE_URL` | Real Codex base URL |
| `CODEX_REAL_ACCOUNT_ID` | Rotated Codex BYOK account id for staging |
| `CODEX_REAL_SECRET` | Rotated Codex BYOK secret for staging |
| `CLAUDE_CODE_BASE_URL` | Real Claude Code base URL |
| `CLAUDE_CODE_REAL_ACCOUNT_ID` | Rotated Claude Code BYOK account id for staging |
| `CLAUDE_CODE_REAL_SECRET` | Rotated Claude Code BYOK secret for staging |

The specs keep the local replay server as the default path. In staging mode
they switch to the real SaaS endpoints, skip request-body introspection, and
assert only the shared adapter contract:

- non-empty final content
- `conversation.message.started`
- `conversation.message.completed`

This keeps the same spec files usable in both local and staging contexts.

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

## Staging Pipeline

The staging-only entrypoint is:

```bash
pnpm test:e2e:staging
```

That runner:

1. sets `AGENTHUB_REAL_PROVIDER_MODE=staging`
2. executes `pnpm test:e2e:providers`
3. executes the four `k6` scenarios under `tests/load/`

For a local operator dry run, execute:

```bash
AGENTHUB_STAGING_DRY_RUN=1 pnpm test:e2e:staging
```
