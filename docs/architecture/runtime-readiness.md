# Runtime Readiness

This document maps the AgentHub Release 1 runtime topology to the production
target of `3 000` concurrent web clients and `500` concurrent agent
executions, and records the operational expectations for each tier.

## Runtime Topology

```
┌────────────────┐    HTTP / SSE     ┌──────────────────┐
│   apps/web     ├──────────────────▶│     apps/api     │
│  (Next.js 15)  │                   │ (Nest + Fastify) │
└──────┬─────────┘                   └─────┬─────┬──────┘
       │ assets / RSC                       │     │
       ▼                                    │     │ Temporal client
┌────────────────┐                          │     ▼
│ Static / CDN   │                          │  ┌────────────────┐
└────────────────┘                          │  │ apps/worker     │
                                            │  │  (Temporal SDK) │
                                            │  └────┬───────────┘
                                            │       │ provider HTTP
                                            ▼       ▼
                                       ┌────────────────────┐
                                       │ Hermes / OpenClaw  │
                                       │ Codex / Claude Code│
                                       └────────────────────┘
```

## Service Roles

| Service | Responsibility | Scaling Plan |
| --- | --- | --- |
| `apps/web` | Browser shell, chat UI, BYOK setup, SSE consumer. | Horizontal autoscale; stateless. |
| `apps/api` | Conversation, message, credential, artifact APIs and SSE producer. | Horizontal autoscale; sized to handle 3 000 concurrent SSE subscribers. |
| `apps/worker` | Temporal workflows, provider invocations, retries, aggregation. | Sized to absorb 500 concurrent agent executions plus retry headroom. |

## State Stores

| Store | Use | Capacity Notes |
| --- | --- | --- |
| `PostgreSQL` | Conversations, messages, artifacts, credentials, custom agents, conversation_agents, pinned context. | Provision a managed instance with read-replica capability for the session list query. |
| `Redis` | Rate-limit buckets, transient stream coordination, caching. | Required for the rate-limit service if it is moved out of in-memory storage. |
| `Object storage` | S3-compatible bucket for artifact uploads. | Operates with presigned PUT URLs. |
| `Temporal` | Durable orchestration. | Sized for `500` concurrent workflow executions. |

## Observability Hooks

- Structured JSON logs from API and worker, with `traceId`/`spanId` fields.
- Prometheus counters and summaries:
  - `provider_dispatch_total`, `provider_dispatch_success_total`, `provider_dispatch_error_total`
  - `worker_dispatch_total`, `worker_dispatch_success_total`, `worker_dispatch_error_total`
  - `orchestrator_state_total`
  - `trace_span_total`, `trace_span_duration_ms`
- Health endpoints: `GET /health`, `GET /health/liveness`, `GET /health/readiness`.

## Failure Surfaces

| Failure | Handling |
| --- | --- |
| Rate limit exceeded | API returns `429` with `code`, `message`, `retryAfterMs`. |
| Provider HTTP 5xx | Adapter throws `AgentAdapterError` with `provider_failed` and `retryable: true` for 5xx. |
| Provider timeout | Worker retry policy (`dispatchRetryPolicy`) retries with exponential backoff; orchestrator reports `partial_failure`. |
| Missing BYOK credential | Adapter throws `AgentAdapterError` with `missing_credential`. |
| Validation failure | API returns `400`; mapped to `validation` by `mapToPublicError`. |

## Capacity Validation

The production target is validated through the four k6 scenarios documented
in `tests/load/README.md`. Acceptance is captured in
`docs/operations/load-test-results.md`. Bottleneck notes from the most recent
run feed back into the deploy plan and the release-readiness log.

## Future Expansion Hooks

The Release 1 schema reserves `workspace_id`, `credential_source`,
`platform_managed` enum values, and ownership metadata so the runtime can
graduate to multi-tenant workspaces, shared conversations, and
platform-managed credentials without a destructive migration.
