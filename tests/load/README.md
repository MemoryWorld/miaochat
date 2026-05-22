# Load Tests

This directory holds the load-test scenarios for AgentHub Release 1. They are
[k6](https://grafana.com/docs/k6/) scripts that target the deployed API and
worker stack.

## Scenarios

| File | Purpose | Target Capacity |
| --- | --- | --- |
| `session-list.js` | Saturate the conversation list read path. | 3 000 concurrent VUs reading `/conversations`. |
| `send-message.js` | Stress the user message submission path. | 750 messages/second across 3 000 max VUs. |
| `group-orchestration.js` | Exercise concurrent multi-agent orchestration. | 500 concurrent agent executions. |
| `stream-stability.js` | Validate long-lived SSE connection stability. | 3 000 concurrent stream subscribers. |

These scenarios were sized to match the fixed Release 1 production target of
`3 000` concurrent web clients and `500` concurrent agent executions described
in the release plan.

## Running A Scenario

Each scenario is executed with the `k6` CLI:

```bash
k6 run tests/load/session-list.js
k6 run tests/load/send-message.js
k6 run tests/load/group-orchestration.js
k6 run tests/load/stream-stability.js
```

Override the API target and seed data through environment variables:

| Variable | Description |
| --- | --- |
| `AGENTHUB_API_BASE_URL` | Base URL for the API service under test. Defaults to `http://localhost:3001`. |
| `AGENTHUB_WORKSPACE_ID` | Workspace identifier the load test targets. Defaults to `default-workspace`. |
| `AGENTHUB_LOAD_CONVERSATION_IDS` | Comma-separated list of seeded direct conversations for `send-message.js`. |
| `AGENTHUB_LOAD_GROUP_CONVERSATION_IDS` | Comma-separated list of seeded group conversations for `group-orchestration.js`. |
| `AGENTHUB_LOAD_STREAM_CONVERSATION_IDS` | Comma-separated list of seeded conversations for `stream-stability.js`. |

The test data should be seeded once before the load run by calling the
existing `/conversations` API or by invoking `pnpm db:seed`. Seeded
conversation identifiers must be passed through the environment variables
above so each VU can pick a valid target without hot-pinning the database.

## Thresholds

Each scenario sets `k6` thresholds that the release checklist tracks:

- `session-list.js`: `p95 < 400 ms`, `p99 < 800 ms`, error rate `< 1%`.
- `send-message.js`: `p95 < 800 ms`, `p99 < 1 500 ms`, error rate `< 2%`.
- `group-orchestration.js`: `p95 < 1 500 ms`, `p99 < 3 000 ms`, error rate `< 5%`.
- `stream-stability.js`: `p95 connect < 800 ms`, fewer than `150` disconnects
  during a single ramp.

A run is considered passing only when every threshold passes. The summary
output is captured under `docs/operations/load-test-results.md` whenever a
release candidate is cut.

## Local Verification

The `pnpm test:load` script invokes `tests/load/placeholder.js` so that
package-level CI does not require a `k6` binary. The placeholder simply prints
a reminder that the real scenarios live in this directory and are gated on the
operational `k6` runner.
