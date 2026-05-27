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

## Phase A Hermes And OpenClaw Runtime Baseline

On `2026-05-28`, the Phase A milestone added an application-level runtime
acceptance slice for `Hermes` and `OpenClaw`. This slice is narrower than the
full four-provider Release 1 gate: it proves that the browser/API/worker path
no longer stops at mock-only execution for the two baseline providers.

### What Phase A Proves

- The worker now routes direct and group executions through a provider adapter
  factory instead of hardcoded mock adapters.
- Direct conversations can execute with `Hermes` or `OpenClaw`.
- Group orchestration can mix `Hermes` and `OpenClaw` in one conversation.
- Pinned context is replayed into the real provider request body.
- The BYOK setup path is still exercised in the web layer and in runtime
  integration for the two baseline providers.

### Verification Commands

Boot the local runtime dependencies:

```bash
docker compose -f infra/docker/compose.dev.yml up -d postgres pgbouncer redis temporal
```

Then run the Phase A runtime slice:

```bash
pnpm exec vitest run tests/integration/phase-a-runtime-baseline.spec.ts
pnpm exec vitest run tests/e2e/hermes-real.spec.ts tests/e2e/openclaw-real.spec.ts
pnpm exec vitest run tests/e2e/byok-onboarding.spec.tsx
```

The integration spec binds BYOK credentials for both providers through the API,
creates direct and group conversations, verifies stream events, and asserts that
the captured Hermes request body contains replayed pinned messages.

### What Phase A Does Not Prove

- `Codex` runtime wiring
- `Claude Code` runtime wiring
- four-provider staging acceptance
- full load-test evidence
- final Release 1 release sign-off

## Local Xiaomi MiMo Shims For Hermes And OpenClaw

On `2026-05-24`, a separate local verification slice reported live upstream
traffic for `Hermes` and `OpenClaw` through Xiaomi MiMo-backed shims. The
developer-owned notes live in `progress.md`; the commands below mirror that
reported setup.

Run the shims in separate terminals:

```bash
# Terminal A
cd /home/torch/miaochat
pnpm shim:openclaw

# Terminal B
cd /home/torch/miaochat
pnpm shim:hermes
```

Smoke the shim endpoints before trusting the adapter specs:

```bash
curl -sS -H 'Content-Type: application/json' \
  -d '{"messages":[{"role":"user","content":"Reply with only PONG."}]}' \
  http://127.0.0.1:19002/v1/chat/completions

curl -sS -H 'Content-Type: application/json' \
  -d '{"prompt":"Plan the release"}' \
  http://127.0.0.1:19003/v1/messages/stream
```

Then run the real-provider specs in staging mode against the shim endpoints:

```bash
cd /home/torch/miaochat
AGENTHUB_REAL_PROVIDER_MODE=staging \
  OPENCLAW_BASE_URL=http://127.0.0.1:19002 \
  OPENCLAW_REAL_ACCOUNT_ID=miaochat \
  OPENCLAW_REAL_SECRET=shim-ignored \
  HERMES_BASE_URL=http://127.0.0.1:19003 \
  HERMES_REAL_ACCOUNT_ID=miaochat \
  HERMES_REAL_SECRET=shim-ignored \
  pnpm exec vitest run --testTimeout=120000 \
  tests/e2e/openclaw-real.spec.ts \
  tests/e2e/hermes-real.spec.ts
```

Important caveats from that slice:

- `Hermes` can produce a misleading fast pass if the shim exits before the
  upstream CLI emits content. Treat a sub-second pass as suspect and rely on
  the smoke commands above before accepting the result.
- The `Hermes` shim uses `--max-turns 1 --accept-hooks` as a test-only escape
  hatch. This is not a production worker runtime configuration.
- `OpenClaw` was isolated under `~/.openclaw-miaochat`; `Hermes` reused the
  developer's `~/.hermes` state during that local slice.

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

## Staging Browser BYOK Acceptance

The provider adapter specs only prove the runtime contract. Release 1 also
requires a browser-driven `BYOK` onboarding check through `/setup`.

Use the dedicated Playwright suite:

```bash
pnpm staging:preflight
pnpm test:e2e:byok:staging
```

Required environment variables:

| Variable | Description |
| --- | --- |
| `AGENTHUB_WEB_BASE_URL` | Deployed web URL for the staging environment |
| `AGENTHUB_API_BASE_URL` | Deployed API URL used for auth bootstrap and cleanup |
| `HERMES_E2E_ACCOUNT_ID` | Browser BYOK account id for Hermes |
| `HERMES_E2E_SECRET` | Browser BYOK secret for Hermes |
| `OPENCLAW_E2E_ACCOUNT_ID` | Browser BYOK account id for OpenClaw |
| `OPENCLAW_E2E_SECRET` | Browser BYOK secret for OpenClaw |
| `CODEX_E2E_ACCOUNT_ID` | Browser BYOK account id for Codex |
| `CODEX_E2E_SECRET` | Browser BYOK secret for Codex |
| `CLAUDE_CODE_E2E_ACCOUNT_ID` | Browser BYOK account id for Claude Code |
| `CLAUDE_CODE_E2E_SECRET` | Browser BYOK secret for Claude Code |

The suite signs up a fresh staging user through `/auth/signup`, opens `/setup`,
validates the credential, saves it, confirms the bound row, and then deletes
the credential through the API so the run remains repeatable.

Before the staging run, use:

```bash
pnpm staging:preflight
```

This prints the exact missing GitHub `staging` secrets and reports whether the
workflow has been merged to the default branch yet.

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

For the Release 1 cut to ship, all four `*-real.spec.ts` files must pass
against a live upstream path:

- `Hermes` and `OpenClaw`: either the documented Xiaomi MiMo shim path above or
  direct staging SaaS endpoints
- `Codex` and `Claude Code`: staging SaaS endpoints

The browser BYOK suite must also pass for all four providers with valid
staging credentials.

Phase A is intentionally narrower: the local jsdom setup flow now covers
`Hermes` and `OpenClaw`, while the runtime integration slice proves those two
providers can reach a usable conversation path after binding credentials.

## Staging Pipeline

The staging-only entrypoint is:

```bash
pnpm test:e2e:staging
```

That runner:

1. executes `pnpm test:e2e:byok:staging`
2. sets `AGENTHUB_REAL_PROVIDER_MODE=staging`
3. executes `pnpm test:e2e:providers`
4. executes the four `k6` scenarios under `tests/load/`

For a local operator dry run, execute:

```bash
AGENTHUB_STAGING_DRY_RUN=1 pnpm test:e2e:staging
```

To generate the three `AGENTHUB_LOAD_*` variables against a reachable API
surface, use:

```bash
AGENTHUB_API_BASE_URL=https://api.example.invalid \
pnpm staging:seed-load
```

The script signs up a throwaway user, creates mock direct/group agents, creates
direct/group/stream conversations, and prints export-ready values for
`AGENTHUB_LOAD_CONVERSATION_IDS`,
`AGENTHUB_LOAD_GROUP_CONVERSATION_IDS`, and
`AGENTHUB_LOAD_STREAM_CONVERSATION_IDS`.
