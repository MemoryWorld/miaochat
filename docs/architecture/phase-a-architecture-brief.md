# Phase A Architecture Brief

## Objective

Explain the current `Hermes + OpenClaw` baseline in a way that is fast to
defend during review or demo Q&A.

## Core Shape

The current runtime path is:

`web -> api -> Temporal workflow -> worker activity -> provider adapter`

The important part is that the application now uses the real provider runtime
path for `Hermes` and `OpenClaw` instead of stopping at mock adapters.

## Unified Adapter Contract

All providers are normalized behind the same execution contract:

- request in: agent id, conversation id, workspace id, message, pinned context,
  credential id, provider id
- result out: final content plus normalized stream events

This is why the API and worker can pass one provider-independent shape through
the runtime and let adapters own the protocol differences.

## Communication Differences We Hide

### Hermes

- Request shape is prompt-centric
- Runtime stream is NDJSON
- Credential model is BYOK plus account id

### OpenClaw

- Request shape is chat-completion-like
- Runtime stream is SSE with chunk/completed markers
- Credential model is BYOK plus account id

## How The Differences Are Hidden

The repository currently hides those differences in three places:

1. `packages/agent-adapters`
   - request shaping
   - protocol parsing
   - stream normalization
2. `apps/worker/src/activities/provider-runtime.ts`
   - provider selection
   - credential lookup
   - runtime adapter construction
3. `packages/agent-sdk`
   - shared execution request/result contract

The API does not need to know whether a provider speaks NDJSON or SSE; it only
knows that the worker will emit normalized stream events back into the chat
timeline.

## Why Other Providers Are Deferred

`Codex`, `Claude Code`, and `morph-labs/hermes-agent-fork` are deferred because
the current milestone optimizes for a defendable local demo path rather than
full provider breadth.

That tradeoff keeps the repository honest:

- current baseline: `Hermes + OpenClaw`
- deferred runtime/provider work: explicit, documented, and still visible
