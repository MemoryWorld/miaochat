# Provider Acceptance

This document describes how AgentHub Release 1 validates provider behavior for
`Hermes`, `OpenClaw`, `Codex`, and `Claude Code` without claiming fake
endpoints as real platform integrations.

## Test Strategy

Each provider has a dedicated spec under `tests/e2e/`:

- `tests/e2e/hermes-real.spec.ts`
- `tests/e2e/openclaw-real.spec.ts`
- `tests/e2e/codex-real.spec.ts`
- `tests/e2e/claude-code-real.spec.ts`

Hermes and OpenClaw keep local streaming replay specs because their current
acceptance path still targets HTTP-compatible shims or SaaS endpoints. Codex
and Claude Code are different: they do not use a Miaochat-owned fake HTTP
endpoint. Their adapters now target the official execution surfaces:

- `ClaudeCodeAdapter` calls the official `@anthropic-ai/claude-agent-sdk`
  `query()` interface.
- `CodexAdapter` launches the official `codex exec --json` non-interactive CLI
  path and parses JSONL events.

The package-level adapter unit specs use injected SDK/CLI runners so local CI can
verify parsing, credential injection, and stream normalization without spending
real provider credits. The `tests/e2e/claude-code-real.spec.ts` and
`tests/e2e/codex-real.spec.ts` files are honest gated acceptance specs: they are
skipped unless `AGENTHUB_REAL_PROVIDER_MODE=staging` and the corresponding real
secret is present.

After a Claude Code or Codex run, the adapter captures tracked-file `git diff`
output plus synthetic `/dev/null` new-file diffs for untracked files from the
configured runtime workspace and returns the result as a runtime `diff` artifact.
The API persists that artifact as `kind: "diff"` with `text/x-diff` content, so
the chat timeline can show the coding agent's actual patch instead of only a
prose summary.

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

## Replacing Local Endpoints With Real Providers

To run the real-provider specs, set `AGENTHUB_REAL_PROVIDER_MODE=staging` and
provide the following environment variables before running
`pnpm test:e2e:providers` or `pnpm test:e2e:staging`:

| Variable | Description |
| --- | --- |
| `HERMES_BASE_URL` | Real Hermes base URL |
| `HERMES_REAL_ACCOUNT_ID` | Rotated Hermes BYOK account id for staging |
| `HERMES_REAL_SECRET` | Rotated Hermes BYOK secret for staging |
| `OPENCLAW_BASE_URL` | Real OpenClaw base URL |
| `OPENCLAW_REAL_ACCOUNT_ID` | Rotated OpenClaw BYOK account id for staging |
| `OPENCLAW_REAL_SECRET` | Rotated OpenClaw BYOK secret for staging |
| `CODEX_REAL_SECRET` | OpenAI/Codex API key used only for the `codex exec` process environment |
| `CODEX_EXECUTABLE` | Optional path to the `codex` CLI when it is not on `PATH` |
| `CODEX_MODEL` | Optional Codex model override |
| `CLAUDE_CODE_REAL_SECRET` | Anthropic API key used only for the Claude Agent SDK call |
| `CLAUDE_CODE_EXECUTABLE` | Optional path to a separately installed `claude` binary |
| `CLAUDE_CODE_MODEL` | Optional Claude model override |

Hermes and OpenClaw specs keep the local replay server as the default path. In
staging mode they switch to the configured upstream endpoints. Codex and Claude
Code specs do not have a local replay default; they are skipped until real
credentials are supplied. In staging mode all four specs assert the shared
adapter contract:

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
- Missing Codex CLI or Claude Agent SDK runtime (mapped to `missing_runtime`).

The retry policy in `apps/worker/src/activities/retry-policy.ts` is exercised
through `apps/worker/test/retry-policy.spec.ts` and is wired to the four real
adapters when they are dispatched from worker activities.

## Release Acceptance Gate

For the Release 1 cut to ship, all four `*-real.spec.ts` files must pass
against a live upstream path:

- `Hermes` and `OpenClaw`: either the documented Xiaomi MiMo shim path above or
  direct staging SaaS endpoints
- `Codex`: official `codex exec --json` with a valid `CODEX_REAL_SECRET`
- `Claude Code`: official Claude Agent SDK with a valid
  `CLAUDE_CODE_REAL_SECRET`

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
