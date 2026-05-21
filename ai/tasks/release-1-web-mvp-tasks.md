# Tasks: AgentHub Release 1 Web MVP

## Task Status

This document is the task breakdown derived from the approved plan in [ai/plans/release-1-web-mvp-plan.md](../plans/release-1-web-mvp-plan.md).

Tasks are ordered by dependency. Execution should start at the top and move downward unless a later task is explicitly marked as parallel-safe.

## Phase 0: Foundation

- [x] Task 01: Bootstrap the monorepo workspace and root developer tooling
  - Acceptance: The repository has a working `pnpm workspace` and `turborepo` root setup with shared TypeScript, lint, build, and test commands exposed from the root.
  - Verify: `pnpm install`; `pnpm lint`; `pnpm build`; `pnpm test`
  - Files: `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json`, `.gitignore`

- [x] Task 02: Add local infrastructure definitions and environment templates
  - Acceptance: Local development can boot `PostgreSQL`, `Redis`, `Temporal`, and `MinIO` through one Docker Compose file, and the repo has documented env templates for web, API, and worker apps.
  - Verify: `docker compose -f infra/docker/compose.dev.yml up -d postgres redis temporal minio`; `docker compose -f infra/docker/compose.dev.yml ps`
  - Files: `infra/docker/compose.dev.yml`, `.env.example`, `apps/api/.env.example`, `apps/worker/.env.example`, `apps/web/.env.example`

- [x] Task 03: Add shared config packages for lint, format, and test baselines
  - Acceptance: Web, API, worker, and shared packages can inherit consistent ESLint, TypeScript, and test config without copy-pasting local configs.
  - Verify: `pnpm lint`; `pnpm test`
  - Files: `packages/config/package.json`, `packages/config/eslint/base.js`, `packages/config/tsconfig/base.json`, `packages/config/vitest/base.ts`, `packages/config/README.md`

## Phase 1: Contracts And Schema

- [x] Task 04: Create the shared contracts package with conversation and message schemas
  - Acceptance: `packages/contracts` exports validated schemas and TypeScript types for conversations, messages, stream events, and base identifiers.
  - Verify: `pnpm --filter @agenthub/contracts test`; `pnpm --filter @agenthub/contracts build`
  - Files: `packages/contracts/package.json`, `packages/contracts/src/conversation.ts`, `packages/contracts/src/message.ts`, `packages/contracts/src/stream-event.ts`, `packages/contracts/src/index.ts`

- [x] Task 05: Add artifact, credential, and custom-agent schemas
  - Acceptance: Shared contracts cover artifact cards, provider credentials, credential-source abstraction, custom agents, and tool bindings.
  - Verify: `pnpm --filter @agenthub/contracts test`
  - Files: `packages/contracts/src/artifact.ts`, `packages/contracts/src/credential.ts`, `packages/contracts/src/custom-agent.ts`, `packages/contracts/src/tool-binding.ts`, `packages/contracts/src/index.ts`

- [x] Task 06: Define the initial database schema with future tenancy expansion fields
  - Acceptance: Database schema includes conversations, messages, artifacts, provider credentials, custom agents, and future-ready fields such as `workspace_id` and ownership metadata.
  - Verify: `pnpm db:migrate`; `pnpm db:generate`
  - Files: `db/schema.ts`, `db/drizzle.config.ts`, `db/migrations/0001_initial.sql`, `db/README.md`, `packages/contracts/src/database-enums.ts`

- [x] Task 07: Add baseline seed data and migration smoke coverage
  - Acceptance: The repo can seed a minimal local environment with test agents, test conversations, and non-secret example metadata.
  - Verify: `pnpm db:seed`; `pnpm test:integration`
  - Files: `db/seeds/index.ts`, `db/seeds/agents.ts`, `db/seeds/conversations.ts`, `tests/integration/db-seed.spec.ts`

## Phase 2: Adapter And Credential Base

- [x] Task 08: Create the normalized agent SDK contract
  - Acceptance: A single adapter interface defines request shape, streamed event shape, tool-call hooks, error normalization, and retry metadata used by all providers.
  - Verify: `pnpm --filter @agenthub/agent-sdk test`; `pnpm --filter @agenthub/agent-sdk build`
  - Files: `packages/agent-sdk/package.json`, `packages/agent-sdk/src/types.ts`, `packages/agent-sdk/src/errors.ts`, `packages/agent-sdk/src/streaming.ts`, `packages/agent-sdk/src/index.ts`

- [x] Task 09: Implement mock providers and adapter contract tests
  - Acceptance: Mock adapters emit the same normalized streaming and terminal events expected from real providers, and contract tests enforce that shape.
  - Verify: `pnpm --filter @agenthub/agent-adapters test`
  - Files: `packages/agent-adapters/package.json`, `packages/agent-adapters/src/mock/direct-adapter.ts`, `packages/agent-adapters/src/mock/group-adapter.ts`, `packages/agent-adapters/test/adapter-contract.spec.ts`, `packages/agent-adapters/src/index.ts`

- [x] Task 10: Implement the credential-vault domain boundary
  - Acceptance: The platform has a service boundary for storing BYOK credentials, validating provider-specific config, and preserving `credential_source` extensibility without enabling `platform_managed` yet.
  - Verify: `pnpm --filter @agenthub/domain test`
  - Files: `packages/domain/src/credentials/credential-service.ts`, `packages/domain/src/credentials/credential-encryption.ts`, `packages/domain/src/credentials/credential-types.ts`, `packages/domain/src/credentials/index.ts`, `packages/domain/test/credential-service.spec.ts`

## Phase 3: Application Skeletons

- [x] Task 11: Bootstrap the API service with config, logging, and health endpoints
  - Acceptance: `apps/api` starts successfully with typed config loading, structured logging, and at least one health/readiness route.
  - Verify: `pnpm --filter api dev`; `pnpm --filter api test`
  - Files: `apps/api/package.json`, `apps/api/src/main.ts`, `apps/api/src/app.module.ts`, `apps/api/src/health/health.controller.ts`, `apps/api/test/health.e2e-spec.ts`

- [x] Task 12: Bootstrap the worker service with Temporal wiring
  - Acceptance: `apps/worker` can connect to Temporal, register at least one placeholder workflow and activity, and start cleanly in local development.
  - Verify: `pnpm --filter worker dev`; `pnpm --filter worker test`
  - Files: `apps/worker/package.json`, `apps/worker/src/main.ts`, `apps/worker/src/workflows/index.ts`, `apps/worker/src/activities/index.ts`, `apps/worker/test/worker-bootstrap.spec.ts`

- [x] Task 13: Bootstrap the web application shell
  - Acceptance: `apps/web` starts with an app shell containing conversation navigation, main chat viewport, and a placeholder setup route for BYOK.
  - Verify: `pnpm --filter web dev`; `pnpm --filter web build`
  - Files: `apps/web/package.json`, `apps/web/src/app/layout.tsx`, `apps/web/src/app/page.tsx`, `apps/web/src/app/setup/page.tsx`, `apps/web/src/components/app-shell.tsx`

## Phase 4: BYOK And Single-Agent Base

- [x] Task 14: Add API endpoints for BYOK credential lifecycle
  - Acceptance: API supports create, validate, list, and revoke credential records for supported providers without exposing raw secrets back to the client.
  - Verify: `pnpm --filter api test`; `pnpm test:integration`
  - Files: `apps/api/src/modules/credentials/credentials.controller.ts`, `apps/api/src/modules/credentials/credentials.service.ts`, `apps/api/src/modules/credentials/credentials.module.ts`, `apps/api/src/modules/credentials/dto.ts`, `tests/integration/credentials-api.spec.ts`

- [x] Task 15: Add the guided BYOK onboarding flow in the web app
  - Acceptance: A user can select a provider, input BYOK credentials through a guided form, see validation results, and bind the credential for later use.
  - Verify: `pnpm --filter web test`; `pnpm test:e2e`
  - Files: `apps/web/src/app/setup/page.tsx`, `apps/web/src/features/setup/provider-selector.tsx`, `apps/web/src/features/setup/credential-form.tsx`, `apps/web/src/features/setup/validation-state.tsx`, `tests/e2e/byok-onboarding.spec.ts`

- [x] Task 16: Implement conversation and message persistence APIs
  - Acceptance: API supports creating conversations, loading conversation lists, storing messages, loading message history, and marking pinned context messages.
  - Verify: `pnpm --filter api test`; `pnpm test:integration`
  - Files: `apps/api/src/modules/conversations/conversations.controller.ts`, `apps/api/src/modules/conversations/conversations.service.ts`, `apps/api/src/modules/messages/messages.controller.ts`, `apps/api/src/modules/messages/messages.service.ts`, `tests/integration/conversations-api.spec.ts`

- [x] Task 17: Add SSE stream plumbing between API and browser
  - Acceptance: The browser can subscribe to a conversation stream and receive normalized message events without full-page polling.
  - Verify: `pnpm --filter api test`; `pnpm --filter web test`
  - Files: `apps/api/src/modules/streams/streams.controller.ts`, `apps/api/src/modules/streams/stream-broker.service.ts`, `apps/web/src/features/chat/use-conversation-stream.ts`, `packages/contracts/src/stream-event.ts`, `tests/integration/streaming.spec.ts`

- [x] Task 18: Deliver the single-agent mock end-to-end vertical slice
  - Acceptance: A user can start a conversation, send a message, trigger a mock provider through API and worker, observe streaming output, and reload the conversation from persistence.
  - Verify: `pnpm test:e2e`; `pnpm test:integration`
  - Files: `apps/api/src/modules/messages/message-dispatch.service.ts`, `apps/worker/src/workflows/single-agent.workflow.ts`, `apps/web/src/features/chat/chat-thread.tsx`, `apps/web/src/features/chat/chat-composer.tsx`, `tests/e2e/single-agent-mock.spec.ts`

- [x] Task 19: Add pinned-context retrieval and replay behavior
  - Acceptance: Pinned messages are persisted, reloaded, and included in the assembled context passed to the provider execution path.
  - Verify: `pnpm test:integration`; `pnpm test:e2e`
  - Files: `packages/domain/src/context/context-assembler.ts`, `apps/api/src/modules/messages/pin-message.service.ts`, `apps/web/src/features/chat/pin-message-action.tsx`, `tests/integration/pinned-context.spec.ts`, `tests/e2e/pinned-context.spec.ts`

## Phase 5: Group Chat And Orchestration

- [x] Task 20: Implement group-conversation membership and `@agent` targeting
  - Acceptance: A conversation can include multiple agents, and user messages can target a specific agent by explicit mention.
  - Verify: `pnpm test:integration`; `pnpm --filter web test`
  - Files: `db/migrations/0002_group-conversation.sql`, `apps/api/src/modules/conversations/group-members.service.ts`, `apps/web/src/features/chat/agent-mention-input.tsx`, `packages/contracts/src/conversation.ts`, `tests/integration/group-membership.spec.ts`

- [x] Task 21: Implement the orchestrator workflow for multi-agent dispatch
  - Acceptance: The worker can decompose a group-chat request, dispatch to multiple agents, track state transitions, and aggregate responses into one conversation timeline.
  - Verify: `pnpm --filter worker test`; `pnpm test:integration`
  - Files: `apps/worker/src/workflows/group-orchestrator.workflow.ts`, `apps/worker/src/activities/dispatch-agent.activity.ts`, `apps/worker/src/activities/aggregate-results.activity.ts`, `packages/domain/src/orchestration/orchestrator-state.ts`, `tests/integration/group-orchestrator.spec.ts`

- [x] Task 22: Add partial-failure, timeout, and downgrade surfaces to group chat
  - Acceptance: If one sub-agent fails or times out, the conversation timeline still receives structured partial-failure output and the orchestrator completes deterministically.
  - Verify: `pnpm --filter worker test`; `pnpm test:e2e`
  - Files: `apps/worker/src/activities/failure-handling.activity.ts`, `packages/contracts/src/orchestrator-event.ts`, `apps/web/src/features/chat/system-status-card.tsx`, `tests/integration/group-failure.spec.ts`, `tests/e2e/group-failure.spec.ts`

## Phase 6: Custom Agents And Tool Runtime

- [x] Task 23: Implement the custom-agent registry and persistence layer
  - Acceptance: The platform can persist light custom-agent definitions with prompts, tags, provider bindings, and tool references.
  - Verify: `pnpm --filter api test`; `pnpm test:integration`
  - Files: `apps/api/src/modules/custom-agents/custom-agents.controller.ts`, `apps/api/src/modules/custom-agents/custom-agents.service.ts`, `db/migrations/0003_custom-agents.sql`, `packages/contracts/src/custom-agent.ts`, `tests/integration/custom-agent-api.spec.ts`

- [x] Task 24: Implement the tool registry and server-side extension loading path
  - Acceptance: Heavy custom agents can register tool extensions through developer config files or server-side registration without changing provider adapters.
  - Verify: `pnpm --filter @agenthub/tool-runtime test`; `pnpm test:integration`
  - Files: `packages/tool-runtime/package.json`, `packages/tool-runtime/src/tool-registry.ts`, `packages/tool-runtime/src/tool-loader.ts`, `apps/api/src/modules/tools/tool-registration.service.ts`, `tests/integration/tool-registry.spec.ts`

- [x] Task 25: Add the web flows for custom-agent creation and selection
  - Acceptance: Users can create a light custom agent in the UI and select it in a conversation create flow.
  - Verify: `pnpm --filter web test`; `pnpm test:e2e`
  - Files: `apps/web/src/app/agents/page.tsx`, `apps/web/src/features/agents/agent-form.tsx`, `apps/web/src/features/agents/agent-list.tsx`, `apps/web/src/features/conversations/new-conversation-dialog.tsx`, `tests/e2e/custom-agent-ui.spec.tsx`

## Phase 7: Artifact Layer

- [ ] Task 26: Add artifact metadata persistence and attachment storage hooks
  - Acceptance: The platform can persist artifact metadata, link artifacts to messages, and prepare uploads to S3-compatible storage without exposing storage credentials to the client.
  - Verify: `pnpm test:integration`
  - Files: `apps/api/src/modules/artifacts/artifacts.service.ts`, `apps/api/src/modules/artifacts/storage.service.ts`, `db/migrations/0004_artifacts.sql`, `packages/contracts/src/artifact.ts`, `tests/integration/artifacts-api.spec.ts`

- [ ] Task 27: Add preview cards and baseline Diff cards to the chat timeline
  - Acceptance: The web app renders artifact preview cards, attachment cards, and a baseline Diff card inside the conversation stream.
  - Verify: `pnpm --filter web test`; `pnpm test:e2e`
  - Files: `apps/web/src/features/artifacts/artifact-card.tsx`, `apps/web/src/features/artifacts/preview-card.tsx`, `apps/web/src/features/artifacts/diff-card.tsx`, `apps/web/src/features/chat/chat-message.tsx`, `tests/e2e/artifact-cards.spec.ts`

## Phase 8: Observability And Hardening

- [ ] Task 28: Add structured logging, tracing, metrics, and health signals
  - Acceptance: API and worker emit structured logs, expose health/readiness surfaces, and publish core traces and metrics for provider calls and orchestration state changes.
  - Verify: `pnpm --filter api test`; `pnpm --filter worker test`
  - Files: `apps/api/src/observability/observability.module.ts`, `apps/worker/src/observability/observability.ts`, `infra/observability/otel-config.yaml`, `infra/observability/prometheus.yml`, `docs/operations/observability.md`

- [ ] Task 29: Add rate-limit, retry, and safe-error guardrails
  - Acceptance: The platform enforces rate-limit hooks, retries transient provider failures, and maps internal errors into user-safe surfaced states.
  - Verify: `pnpm test:integration`; `pnpm --filter worker test`
  - Files: `apps/api/src/modules/limits/rate-limit.service.ts`, `apps/worker/src/activities/retry-policy.ts`, `packages/domain/src/errors/public-error-mapper.ts`, `tests/integration/rate-limit.spec.ts`, `tests/integration/error-mapping.spec.ts`

## Phase 9: Real Provider Rollout

- [ ] Task 30: Implement the real `Hermes` adapter
  - Acceptance: `Hermes` supports BYOK validation, normalized request mapping, and streamed response translation into the shared adapter contract.
  - Verify: `pnpm --filter @agenthub/agent-adapters test`; `pnpm test:integration`
  - Files: `packages/agent-adapters/src/hermes/hermes-adapter.ts`, `packages/agent-adapters/src/hermes/hermes-types.ts`, `packages/agent-adapters/test/hermes-adapter.spec.ts`, `apps/api/src/modules/credentials/providers/hermes-validator.ts`

- [ ] Task 31: Implement the real `OpenClaw` adapter
  - Acceptance: `OpenClaw` supports BYOK validation, normalized request mapping, and streamed response translation into the shared adapter contract.
  - Verify: `pnpm --filter @agenthub/agent-adapters test`; `pnpm test:integration`
  - Files: `packages/agent-adapters/src/openclaw/openclaw-adapter.ts`, `packages/agent-adapters/src/openclaw/openclaw-types.ts`, `packages/agent-adapters/test/openclaw-adapter.spec.ts`, `apps/api/src/modules/credentials/providers/openclaw-validator.ts`

- [ ] Task 32: Implement the real `Codex` adapter
  - Acceptance: `Codex` supports BYOK validation, normalized request mapping, and streamed response translation into the shared adapter contract.
  - Verify: `pnpm --filter @agenthub/agent-adapters test`; `pnpm test:integration`
  - Files: `packages/agent-adapters/src/codex/codex-adapter.ts`, `packages/agent-adapters/src/codex/codex-types.ts`, `packages/agent-adapters/test/codex-adapter.spec.ts`, `apps/api/src/modules/credentials/providers/codex-validator.ts`

- [ ] Task 33: Implement the real `Claude Code` adapter
  - Acceptance: `Claude Code` supports BYOK validation, normalized request mapping, and streamed response translation into the shared adapter contract.
  - Verify: `pnpm --filter @agenthub/agent-adapters test`; `pnpm test:integration`
  - Files: `packages/agent-adapters/src/claude-code/claude-code-adapter.ts`, `packages/agent-adapters/src/claude-code/claude-code-types.ts`, `packages/agent-adapters/test/claude-code-adapter.spec.ts`, `apps/api/src/modules/credentials/providers/claude-code-validator.ts`

- [ ] Task 34: Add real-provider acceptance coverage for all four providers
  - Acceptance: The release test suite proves at least one real end-to-end conversation path per provider and does not depend on mocks for core acceptance.
  - Verify: `pnpm test:e2e`; `pnpm test:integration`
  - Files: `tests/e2e/hermes-real.spec.ts`, `tests/e2e/openclaw-real.spec.ts`, `tests/e2e/codex-real.spec.ts`, `tests/e2e/claude-code-real.spec.ts`, `docs/operations/provider-acceptance.md`

## Phase 10: Load And Release Readiness

- [ ] Task 35: Add load-test scenarios for concurrency and stream stability
  - Acceptance: The repo contains `k6` scenarios for session-list reads, message submission, concurrent orchestration, and long-lived streaming connections.
  - Verify: `pnpm test:load`
  - Files: `tests/load/session-list.js`, `tests/load/send-message.js`, `tests/load/group-orchestration.js`, `tests/load/stream-stability.js`, `tests/load/README.md`

- [ ] Task 36: Validate release readiness against the fixed production target
  - Acceptance: The project has a documented release checklist covering real-provider readiness, observability readiness, load-test results, and the fixed `3000` concurrent clients / `500` concurrent agent executions target.
  - Verify: `pnpm test`; `pnpm test:e2e`; `pnpm test:load`
  - Files: `docs/operations/release-checklist.md`, `docs/operations/load-test-results.md`, `docs/architecture/runtime-readiness.md`, `ai/logs/release-readiness.md`

## Parallel-Safe Windows

- Tasks `11`, `12`, and `13` can run in parallel after Tasks `01` through `10` are complete.
- Tasks `23`, `24`, and `27` can run in parallel after Tasks `16` through `22` are stable.
- Tasks `30`, `31`, `32`, and `33` can run in parallel after Task `29` is complete.

## Exit Condition For Entering IMPLEMENT

- The task list has been reviewed and approved.
- No task requires hidden scope beyond `Release 1`.
- The execution order is accepted, including the late placement of real-provider rollout.
