# Plan: AgentHub Release 1 Web MVP

## Plan Status

This document is the approved-spec implementation plan for `Release 1`. It is intentionally written before task breakdown and before any application code is created.

## Planning Constraints

- The approved product spec is [SPEC.md](../../SPEC.md).
- `Release 1` scope is `Web MVP` only.
- Provider credential mode is `BYOK only` in Release 1.
- The architecture must reserve expansion space for `platform_managed` credentials, `workspace`, `member`, `role`, `permission`, and shared conversations.
- Final delivery must use real `Hermes`, `OpenClaw`, `Codex`, and `Claude Code` integrations.
- Frontend, API, and async worker remain separate applications; long-running agent work does not execute inside the synchronous web request path.

## Technical Approach

### Application Topology

- `apps/web` serves the browser UI, session shell, chat stream rendering, artifact cards, and BYOK onboarding flow.
- `apps/api` owns synchronous APIs, streaming endpoints, credential lifecycle, conversation lifecycle, artifact metadata, and orchestration triggers.
- `apps/worker` owns Temporal workflows, provider invocations, retries, timeout handling, aggregation, and background artifact processing.
- `packages/contracts` defines shared schemas for conversations, messages, artifacts, events, agent definitions, and credential metadata.
- `packages/agent-sdk` defines the normalized adapter contract used by both mock and real providers.
- `packages/agent-adapters` implements `mock`, `Hermes`, `OpenClaw`, `Codex`, and `Claude Code`.
- `packages/tool-runtime` defines tool registration and execution boundaries for custom agents.
- `packages/domain` holds cross-app business logic that should not be duplicated between API and worker.

### Core Runtime Decisions

- Use `HTTP + SSE` as the initial browser streaming transport in Release 1.
- Use `Temporal` workflows for orchestration instead of ad hoc queue chaining.
- Use `PostgreSQL` as the source of truth for conversations, messages, artifacts, agent definitions, and future tenancy-scoped entities.
- Use `Redis` for cache, rate limiting helpers, transient stream coordination, and hot session state.
- Use `S3-compatible storage` for attachments and previewable artifact files.
- Use `Drizzle ORM` as the SQL-first data access layer.

### Why This Order

- The shared contracts and data model must come first because UI, API, worker, adapters, and tests all depend on them.
- Mock-based vertical slices should land before real providers so the orchestration, persistence, and UI loop can be validated independently from upstream API variance.
- Single-agent flow should land before group orchestration because the latter depends on stable conversation storage, streaming, adapter normalization, and artifact rendering primitives.
- Real provider integration should be late in the order, after adapter contracts, retries, observability, and BYOK flows are already stable.

## Major Components And Dependencies

### 1. Workspace Foundation

Owns the monorepo layout, workspace config, linting, test runners, Docker-based local infrastructure, and CI-ready command surface.

Depends on: none.

Enables: every later phase.

### 2. Shared Contracts And Data Model

Owns Zod schemas, DTOs, event envelopes, domain enums, database schema, migrations, and forward-compatible tenancy fields such as `workspace_id`.

Depends on: workspace foundation.

Enables: API routes, worker workflows, UI state typing, adapter normalization, test fixtures.

### 3. Credential Vault And Agent Registry

Owns BYOK credential capture, validation, encryption-at-rest boundary, provider-account metadata, custom agent definitions, and future `credential_source` expansion points.

Depends on: shared contracts and data model.

Enables: real provider execution, custom agent selection, future `platform_managed` growth.

### 4. Adapter Contract And Mock Providers

Owns the unified provider interface, normalized streaming event model, request/response shaping, mock adapters, and contract tests.

Depends on: shared contracts and credential boundary.

Enables: vertical slice testing without blocking on all real providers.

### 5. API Service Skeleton

Owns conversation APIs, message submission APIs, streaming endpoints, custom agent APIs, artifact metadata APIs, and orchestration trigger endpoints.

Depends on: shared contracts, data model, credential boundary, adapter contract.

Enables: browser-to-platform interaction and worker kickoff.

### 6. Worker And Orchestration Skeleton

Owns Temporal workflow definitions, activity boundaries, retry policy, timeout policy, failure downgrade paths, and artifact/event fan-out.

Depends on: shared contracts, adapter contract, data model.

Enables: real multi-agent execution.

### 7. Web Application Shell

Owns chat layout, session list, message composer, stream viewer, artifact cards, BYOK onboarding flow, and custom agent selection UI.

Depends on: shared contracts and stable API surface.

Enables: end-user validation of the product loop.

### 8. Single-Agent Vertical Slice

Owns the first complete path from browser message submit to stored conversation history to streamed provider output.

Depends on: API skeleton, worker skeleton, web shell, mock adapter.

Enables: first end-to-end verification checkpoint.

### 9. Group Chat And Orchestrator

Owns `@agent` targeting, task decomposition, multi-agent assignment, partial failure handling, aggregation, and timeline updates in the chat stream.

Depends on: single-agent slice and worker skeleton.

Enables: core differentiator of the platform.

### 10. Custom Agents And Tool Runtime

Owns user-defined agent metadata, tool binding configuration, developer-file or server-registration extension path, and runtime execution boundary.

Depends on: credential boundary, adapter contract, API skeleton.

Enables: light and heavy custom-agent usage.

### 11. Artifact Rendering Layer

Owns card metadata, preview routing, attachment lifecycle, preview storage integration, and baseline Diff card rendering.

Depends on: conversation/message pipeline and web shell.

Enables: non-text outputs in chat.

### 12. Observability And Hardening

Owns structured logging, traces, metrics, error capture, health checks, rate-limit hooks, and operational dashboards.

Depends on: API and worker skeletons.

Enables: production-grade debugging and real-provider rollout confidence.

### 13. Real Provider Rollout

Owns real adapter completion, provider-specific normalization, BYOK validation UX, acceptance tests, and fallback handling.

Depends on: adapter contract, credential vault, observability, single-agent slice.

Enables: final delivery readiness.

### 14. Load Validation And Release Readiness

Owns performance test scenarios, capacity validation against the `3000 / 500` target, bottleneck analysis, and release cut criteria.

Depends on: stable end-to-end product loop and observability.

Enables: production launch confidence.

## Implementation Order

### Phase 0: Foundation

Set up workspace layout, package manager, Turborepo, local Docker infra, lint/test tooling, shared environment loading, and base CI commands.

### Phase 1: Contracts And Schema

Define domain schemas, database schema, migrations, seed strategy, stream event contracts, and future-ready tenancy columns.

### Phase 2: Credential And Adapter Base

Build BYOK credential persistence boundary, provider validation flow, unified adapter contract, and mock adapters.

### Phase 3: API And Worker Skeleton

Stand up the API service and worker service with Temporal wiring, conversation/message persistence, and stream event plumbing.

### Phase 4: Web Shell

Build the Web application shell with session list, conversation view, composer, stream viewport, and BYOK onboarding path.

### Phase 5: Single-Agent End-to-End Slice

Connect web, API, worker, persistence, and mock adapter into the first complete end-to-end conversation loop.

### Phase 6: Group Orchestration

Add `@agent` targeting, orchestration workflows, result aggregation, and partial failure handling.

### Phase 7: Custom Agents And Tool Runtime

Add custom-agent creation, selection, and developer-oriented tool extension path.

### Phase 8: Artifact Cards

Add attachment storage, preview cards, and baseline Diff card rendering in the chat stream.

### Phase 9: Observability And Guardrails

Add logging, tracing, metrics, error capture, rate-limit hooks, and health-check surfaces.

### Phase 10: Real Provider Integration

Replace mock-only execution paths with real provider adapters for `Hermes`, `OpenClaw`, `Codex`, and `Claude Code`, while preserving mock coverage for repeatable tests.

### Phase 11: Performance And Release Validation

Run load tests, validate concurrency targets, fix bottlenecks, and produce release-readiness evidence.

## Parallelization Strategy

### Sequential Backbone

- Phase 0 must finish before meaningful feature work begins.
- Phase 1 must finish before durable API, worker, or web integration starts.
- Phase 5 must complete before Phase 6 because group orchestration depends on a stable single-agent loop.
- Phase 10 must happen after observability and BYOK flows are stable.

### Parallel Work Lanes After Contracts Stabilize

- API skeleton and worker skeleton can progress in parallel once Phase 2 is stable.
- Web shell can progress in parallel with API and worker skeletons after contracts are frozen.
- Artifact rendering can start in parallel with custom-agent work after the base message model is stable.
- Real provider adapters can be implemented in parallel by provider once the normalized adapter contract is locked.
- Observability instrumentation can begin as soon as API and worker skeletons exist; it should not wait until the end.

## Key Risks And Mitigations

### Risk 1: Provider Behavior Divergence

`Hermes`, `OpenClaw`, `Codex`, and `Claude Code` are likely to differ in streaming behavior, tool calling, rate limits, and error models.

Mitigation:

- Normalize all provider events through one adapter contract.
- Keep provider-specific fallback logic inside adapters.
- Add contract tests that assert mock and real providers produce the same normalized shape.

### Risk 2: Temporal Workflow Complexity

Durable workflows reduce long-term risk but increase early implementation complexity.

Mitigation:

- Keep Release 1 workflows narrow and explicit.
- Start with a small workflow graph: submit, dispatch, collect, aggregate, finalize.
- Avoid building a generic workflow DSL in Release 1.

### Risk 3: BYOK User Experience Failure

If credential binding is hard, users will fail before they even reach the product value.

Mitigation:

- Add provider-specific validation steps and error mapping.
- Store connection status and last validation result per provider.
- Design the onboarding path as a guided setup flow, not a raw settings form.

### Risk 4: Future Tenancy Retrofitting

Ignoring future `workspace` and permission needs now would create an expensive migration later.

Mitigation:

- Include scope fields and ownership boundaries in the initial schema.
- Keep repositories and services scoped even if Release 1 uses a default workspace.

### Risk 5: Streaming And Backpressure Under Load

Long-lived streams and many agent executions can create bottlenecks in API and worker communication.

Mitigation:

- Separate synchronous request handling from async execution.
- Instrument stream lifecycle metrics early.
- Validate connection and dispatch behavior with load tests before release.

## Verification Checkpoints

### Checkpoint A: Foundation Ready

- All workspace commands run successfully.
- Local infra boots with Docker.
- Web, API, and worker apps can start in empty-shell mode.

### Checkpoint B: Schema And Contracts Ready

- Database migrations apply cleanly.
- Shared schemas compile across web, API, and worker.
- Contract tests pass for the mock adapter.

### Checkpoint C: BYOK And Single-Agent Flow Ready

- A user can add a provider credential in the Release 1 BYOK flow.
- A conversation can be created, persisted, streamed, and reloaded.
- Single-agent end-to-end tests pass with mock adapters.

### Checkpoint D: Orchestration Ready

- Group chat can target multiple agents.
- Orchestrator can dispatch, collect, aggregate, and surface partial failure states.
- Group-chat end-to-end tests pass with mock adapters.

### Checkpoint E: Artifact Layer Ready

- Attachment metadata persists.
- Preview cards and Diff cards render correctly in chat.
- Artifact-related component and end-to-end tests pass.

### Checkpoint F: Real Provider Ready

- `Hermes`, `OpenClaw`, `Codex`, and `Claude Code` all complete at least one real end-to-end path.
- Provider-specific validation, timeout, and error surfaces are observable.

### Checkpoint G: Release Ready

- Load tests validate the `3000` concurrent client and `500` concurrent agent execution target.
- Critical traces, logs, metrics, and error capture are present.
- Release checklist shows no mock-only dependency for core product flows.

## Planning Notes For The Next Phase

- The next document should be a task breakdown under `ai/tasks/`.
- Tasks should be sized so each one can land in a focused session and touch a bounded file set.
- Real provider integration should be split by adapter once the shared contract is stable.
- BYOK onboarding, credential validation, and secure storage should be treated as first-class work, not UI polish.
