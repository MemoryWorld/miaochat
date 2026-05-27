# Release 1 Load Test Results

This document records the most recent load-test runs for AgentHub Release 1.
It is populated whenever the release checklist is exercised.

## Phase A Note

`Phase A: Hermes + OpenClaw Baseline` does not claim load-test completion.
The current milestone closes runtime wiring, provider acceptance, and minimal
BYOK proof for those two providers only. The four k6 scenarios below remain
required work for the final Release 1 cut.

## Staging Acceptance Pipeline

| Field | Value |
| --- | --- |
| Pipeline entrypoint | `pnpm test:e2e:staging` |
| Workflow | `.github/workflows/staging-provider-acceptance.yml` |
| Latest committed local verification | `2026-05-25` staging preflight tool, local load-data seeding tool, prior dry-run, browser BYOK wiring, and reported Hermes/OpenClaw MiMo shim evidence |
| Real staging execution | Pending secrets-backed runner |
| Blocking prerequisite | Workflow not yet merged to the default branch; populate the GitHub `staging` environment secrets, then run `pnpm staging:seed-load` against the deployed API to produce the three load-test conversation-id exports |

## Run Metadata

| Field | Value |
| --- | --- |
| Release candidate | _to be filled per cut_ |
| Tag / commit | _to be filled per cut_ |
| Operator | _to be filled per cut_ |
| Run window (UTC) | _start_ → _end_ |
| API target | `${AGENTHUB_API_BASE_URL}` |
| Worker target | `${WORKER_TASK_QUEUE}` |
| Database tier | `postgres-medium` (placeholder, replace with actual RDS/Neon class) |
| Worker tier | `worker-medium` (placeholder, replace with actual K8s shape) |

## Scenario Outcomes

### `tests/load/session-list.js`

| Metric | Threshold | Observed |
| --- | --- | --- |
| `http_req_duration p95` | `< 400ms` | _to be filled_ |
| `http_req_duration p99` | `< 800ms` | _to be filled_ |
| `http_req_failed` | `< 1%` | _to be filled_ |
| Peak concurrent VUs | `3 000` | _to be filled_ |

### `tests/load/send-message.js`

| Metric | Threshold | Observed |
| --- | --- | --- |
| `http_req_duration p95` | `< 800ms` | _to be filled_ |
| `send_message_latency_ms p99` | `< 1 500ms` | _to be filled_ |
| Sustained throughput | `750 / s` | _to be filled_ |
| `http_req_failed` | `< 2%` | _to be filled_ |

### `tests/load/group-orchestration.js`

| Metric | Threshold | Observed |
| --- | --- | --- |
| `http_req_duration p95` | `< 1 500ms` | _to be filled_ |
| `group_orchestration_latency_ms p99` | `< 3 000ms` | _to be filled_ |
| Peak concurrent orchestrations | `500` | _to be filled_ |
| `http_req_failed` | `< 5%` | _to be filled_ |

### `tests/load/stream-stability.js`

| Metric | Threshold | Observed |
| --- | --- | --- |
| `sse_connect_latency_ms p95` | `< 800ms` | _to be filled_ |
| `sse_connect_latency_ms p99` | `< 1 500ms` | _to be filled_ |
| `sse_disconnects` total | `< 150` | _to be filled_ |
| Peak concurrent SSE clients | `3 000` | _to be filled_ |

## Bottleneck Notes

Track the observed bottlenecks across runs. Common categories to update:

- API CPU saturation
- Postgres connection pool exhaustion
- Temporal task queue backlog
- Provider rate-limit surfaces
- Worker activity timeouts

## Action Items

- [ ] Run-specific follow-ups go here.
- [ ] Confirm threshold breaches (if any) have an owner before the release cut.
- [ ] Run `pnpm staging:preflight` before each formal staging attempt.
- [ ] Refresh `AGENTHUB_LOAD_*` ids with `pnpm staging:seed-load` after the target staging API is ready.
- [ ] Record the eventual demo-video handoff and release sign-off once the full
      Release 1 gate is attempted.

## Decision

| Outcome | Status |
| --- | --- |
| All thresholds met | _yes / no_ |
| Approved for release | _yes / no_ |
| Approver | _name_ |

If any threshold fails, capture the regression in `ai/logs/release-readiness.md`
along with a remediation plan before re-running the scenario.
