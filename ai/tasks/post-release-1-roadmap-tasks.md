  # Tasks: AgentHub Post-Release-1 Roadmap
  
  ## Document Status
  
  This document is the task breakdown for everything required by
  [docs/product/original-requirements.md](../../docs/product/original-requirements.md)
  and [SPEC.md](../../SPEC.md) that was deferred from Release 1, plus the
  quality and polish gaps that surfaced while delivering Release 1 in
  [ai/tasks/release-1-web-mvp-tasks.md](./release-1-web-mvp-tasks.md).
  
  It is split into four product releases (Release 2 through Release 5), one
  strategic release (Release 6), and one cross-cutting hardening track that
  runs in parallel with every release.
  
  Tasks are numbered continuously from `Task 37` onward so that every task ID
  in the repository remains globally unique.
  
  ## Gap Analysis
  
  ### Delivered In Release 1 (Tasks 01-36)
  
  - Monorepo, Docker dev infra, shared lint/test/config baselines.
  - Conversations, messages, pinned context, group orchestration with
    `@agent` targeting and partial-failure surfaces.
  - BYOK credential vault, single-agent and group end-to-end mock slices.
  - Custom-agent registry, light agent UI, server-side tool registry and
    loader for heavy agents.
  - Artifact metadata persistence, S3-compatible storage hooks, baseline
    preview / attachment / diff cards in the chat timeline.
  - Structured logging, metrics, trace recorder, `/health/{liveness,readiness}`,
    `/metrics`, OTLP collector and Prometheus configs.
  - Rate limiting, retry policy, public error mapper.
  - Real `Hermes`, `OpenClaw`, `Codex`, `Claude Code` adapters and acceptance
    specs running against in-process HTTP replay servers.
  - k6 load scenarios, release checklist, runtime readiness doc, release
    readiness log.
  
  ### Deferred But Mandatory (Required After Release 1)
  
  | Capability | Owner Release | Source |
  | --- | --- | --- |
  | User authentication (login) | Release 2 | SPEC §Deferred |
  | Workspace isolation | Release 2 | SPEC §Deferred |
  | Multi-user collaboration | Release 2 | SPEC §Deferred |
  | Roles and permissions | Release 2 | SPEC §Deferred |
  | Shared conversations and audit | Release 2 | SPEC §Deferred |
  | IM polish (archive, search, sort, message operations) | Release 3 | Source §1 |
  | Code re-editing inside artifacts | Release 3 | SPEC §Deferred |
  | Artifact version history | Release 3 | SPEC §Deferred |
  | Heavy custom-agent visual management UI | Release 3 | SPEC §Deferred |
  | One-click deploy and deploy status cards | Release 4 | SPEC §Deferred |
  | Desktop client | Release 5 | SPEC §Deferred |
  | Mobile client | Release 5 | SPEC §Deferred |
  
  ### Strategic Deferred
  
  | Capability | Owner Release | Source |
  | --- | --- | --- |
  | `platform_managed` provider credential mode, credential pool, quota | Release 6 | SPEC §Strategic Deferred |
  
  ### Polish And Hardening Gaps Found In Release 1
  
  - The web client uses inline styles; SPEC.md calls for `Tailwind CSS` and a
    `shadcn/ui` style baseline.
  - API and worker structured logging uses an in-house JSON logger; SPEC.md
    calls for `Pino`.
  - Tracing is emitted as paired log lines instead of real OTLP spans; SPEC.md
    calls for `OpenTelemetry`.
  - Error capture pipeline (`Sentry` or equivalent) is not yet wired.
  - `pgBouncer` is not yet provisioned in front of PostgreSQL.
  - Service code uses raw `pg` queries; SPEC.md calls for `Drizzle ORM` as the
    SQL-first access path.
  - E2E tests are run through `vitest` + `jsdom`; SPEC.md calls for
    `Playwright`.
  - Real provider acceptance specs run against in-process replay servers; the
    release-readiness log requires a successful run against the real SaaS.
  - The rate-limit service holds state in-process; multi-instance API
    deployments need a Redis-backed implementation.
  
  ## Release 2: Identity, Workspaces, Permissions, And Shared Conversations
  
  Goal: turn the platform from a single-user MVP into a multi-tenant
  collaboration product without breaking any of the Release 1 acceptance
  criteria.
  
  ### Phase 11: Identity Foundation
  
  - [x] Task 37: Add the user identity data model and authentication entry points
    - Acceptance: The platform persists `users` and `auth_credentials` records,
      issues secure session tokens, and exposes signup, login, logout, and
      password-reset request endpoints.
    - Verify: `pnpm --filter api test`; `pnpm test:integration`
    - Files: `db/migrations/0005_identity.sql`, `db/schema.ts`,
      `apps/api/src/modules/auth/auth.module.ts`,
      `apps/api/src/modules/auth/auth.controller.ts`,
      `apps/api/src/modules/auth/auth.service.ts`,
      `tests/integration/auth-api.spec.ts`
  
  - [x] Task 38: Replace the implicit `system-user` ownership with the authenticated user identity
    - Acceptance: Conversations, messages, custom agents, and credentials are
      scoped by the authenticated user; the existing single-agent mock and
      group orchestration acceptance flows continue to pass after the rewire.
    - Verify: `pnpm --filter api test`; `pnpm test:integration`; `pnpm test:e2e`
    - Files: `packages/contracts/src/conversation.ts`,
      `packages/contracts/src/credential.ts`,
      `apps/api/src/modules/conversations/conversations.service.ts`,
      `apps/api/src/modules/credentials/credentials.service.ts`,
      `apps/web/src/features/auth/login-page.tsx`
  
  - [x] Task 39: Add session-issuance hardening, rate-limit on auth endpoints, and audit trail of login events
    - Acceptance: Login and password-reset endpoints are rate-limited per IP and
      per email; failed login attempts are recorded in a structured audit log
      with the existing observability stack.
    - Verify: `pnpm --filter api test`; `pnpm test:integration`
    - Files: `apps/api/src/modules/auth/auth-rate-limit.service.ts`,
      `apps/api/src/modules/auth/auth-audit.service.ts`,
      `db/migrations/0006_auth_audit.sql`,
      `tests/integration/auth-rate-limit.spec.ts`
  
  ### Phase 12: Workspace And Membership
  
  - [x] Task 40: Activate the workspace entity end-to-end
    - Acceptance: A user can create at least one workspace; the workspace owner
      is recorded; every conversation, message, artifact, custom agent, and
      credential row is reachable only through its `workspace_id`.
    - Verify: `pnpm --filter api test`; `pnpm test:integration`
    - Files: `db/migrations/0007_workspaces.sql`,
      `apps/api/src/modules/workspaces/workspaces.controller.ts`,
      `apps/api/src/modules/workspaces/workspaces.service.ts`,
      `tests/integration/workspaces-api.spec.ts`
  
  - [x] Task 41: Add workspace membership, invitations, and acceptance flow
    - Acceptance: A workspace owner can invite another user by email; the
      invited user accepts and becomes a workspace member; the membership
      state is queryable through the API and reflected in the web shell.
    - Verify: `pnpm --filter api test`; `pnpm --filter web test`; `pnpm test:e2e`
    - Files: `db/migrations/0008_workspace_members.sql`,
      `apps/api/src/modules/workspaces/memberships.service.ts`,
      `apps/api/src/modules/workspaces/invitations.service.ts`,
      `apps/web/src/features/workspaces/invite-dialog.tsx`,
      `tests/e2e/workspace-membership.spec.tsx`
  
  - [x] Task 42: Switch the web shell to a workspace-scoped session
    - Acceptance: After login the user lands on a default workspace; conversation
      list, custom agents, credentials, and artifact loaders all carry the
      selected `workspaceId` end-to-end; the workspace switcher is wired and
      persists the selection across reloads.
    - Verify: `pnpm --filter web test`; `pnpm test:e2e`
    - Files: `apps/web/src/features/workspaces/workspace-switcher.tsx`,
      `apps/web/src/features/workspaces/use-active-workspace.ts`,
      `apps/web/src/features/chat/chat-experience.tsx`,
      `apps/web/src/features/setup/setup-flow.tsx`,
      `tests/e2e/workspace-scoped-chat.spec.tsx`
  
  ### Phase 13: Authorization
  
  - [x] Task 43: Add a workspace role and permission model
    - Acceptance: The platform persists `workspace_roles` and
      `workspace_permissions`; default roles `owner`, `admin`, and `member`
      have a documented permission matrix; permission changes are audited.
    - Verify: `pnpm --filter api test`; `pnpm test:integration`
    - Files: `db/migrations/0009_workspace_roles.sql`,
      `packages/domain/src/permissions/permission-catalog.ts`,
      `apps/api/src/modules/workspaces/role.service.ts`,
      `tests/integration/workspace-roles.spec.ts`
  
  - [x] Task 44: Enforce permission checks on every workspace-scoped resource
    - Acceptance: Conversations, messages, custom agents, credentials, and
      artifacts each require the appropriate permission to be read or modified;
      violations return a structured `403` through `mapToPublicError`.
    - Verify: `pnpm --filter api test`; `pnpm test:integration`
    - Files: `apps/api/src/modules/auth/permission.guard.ts`,
      `apps/api/src/modules/conversations/conversations.controller.ts`,
      `apps/api/src/modules/messages/messages.controller.ts`,
      `apps/api/src/modules/credentials/credentials.controller.ts`,
      `tests/integration/permission-enforcement.spec.ts`
  
  - [x] Task 45: Add a workspace audit trail and access review surface
    - Acceptance: All sensitive workspace events (member invite, role change,
      credential read, conversation share) are appended to a tamper-evident
      audit log; a workspace owner can review the log through a paginated UI.
    - Verify: `pnpm --filter api test`; `pnpm test:integration`; `pnpm test:e2e`
    - Files: `db/migrations/0010_workspace_audit.sql`,
      `apps/api/src/modules/workspaces/audit.service.ts`,
      `apps/web/src/features/workspaces/audit-log-view.tsx`,
      `tests/e2e/workspace-audit-review.spec.tsx`
  
  ### Phase 14: Shared Conversations And Live Collaboration
  
  - [x] Task 46: Allow conversations to be shared across workspace members
    - Acceptance: A conversation can be shared with one or more workspace
      members; permissions on the shared conversation default to read; the
      conversation list indicates shared conversations distinctly from
      privately owned ones.
    - Verify: `pnpm --filter api test`; `pnpm --filter web test`; `pnpm test:e2e`
    - Files: `db/migrations/0011_conversation_shares.sql`,
      `apps/api/src/modules/conversations/conversation-shares.service.ts`,
      `apps/web/src/features/chat/share-conversation-dialog.tsx`,
      `tests/e2e/shared-conversation.spec.tsx`
  
  - [x] Task 47: Add presence, typing, and per-user read tracking
    - Acceptance: When two users are inside the same shared conversation, each
      sees presence indicators, typing indicators, and a per-user
      last-read marker; the SSE stream carries normalized presence events
      without breaking the existing message contract.
    - Verify: `pnpm --filter api test`; `pnpm test:integration`; `pnpm test:e2e`
    - Files: `packages/contracts/src/presence-event.ts`,
      `apps/api/src/modules/streams/presence-broker.service.ts`,
      `apps/web/src/features/chat/presence-bar.tsx`,
      `tests/integration/presence.spec.ts`
  
  - [x] Task 48: Wire the collaboration audit and the conversation access review
    - Acceptance: Every share event, role change, and read-marker change for a
      shared conversation is captured in the workspace audit log and surfaces
      in the conversation access review panel.
    - Verify: `pnpm --filter api test`; `pnpm test:integration`; `pnpm test:e2e`
    - Files: `apps/api/src/modules/conversations/conversation-access.service.ts`,
      `apps/web/src/features/chat/access-review-panel.tsx`,
      `tests/e2e/shared-conversation-audit.spec.tsx`
  
  ## Release 3: IM Polish, Artifact Iteration, Heavy Custom Agent UI
  
  Goal: close the IM-experience gaps from the original requirements
  (`docs/product/original-requirements.md` §1) and replace the developer-only
  heavy custom-agent path with a UI workflow.
  
  ### Phase 15: IM Experience Completion
  
  - [x] Task 49: Conversation list ergonomics
    - Acceptance: Users can pin, archive, restore, and full-text search
      conversations; the list re-orders by recent activity by default and
      pinned conversations stay above the timeline.
    - Verify: `pnpm --filter web test`; `pnpm test:e2e`
    - Files: `apps/api/src/modules/conversations/conversations.service.ts`,
      `apps/web/src/features/chat/conversation-list.tsx`,
      `tests/e2e/conversation-list-features.spec.tsx`
  
  - [x] Task 50: Message-level actions
    - Acceptance: Users can quote, regenerate, copy code blocks, and apply a
      diff card with one click; each action surfaces in observability metrics
      and is audited inside shared conversations.
    - Verify: `pnpm --filter web test`; `pnpm test:e2e`
    - Files: `apps/web/src/features/chat/message-actions-menu.tsx`,
      `apps/api/src/modules/messages/message-regenerate.service.ts`,
      `tests/e2e/message-actions.spec.tsx`
  
  - [x] Task 51: Inline image and file message rendering
    - Acceptance: Image and file artifacts attached to a message render inline
      with safe content-type handling; large attachments fall back to a
      download link with a virus-scan stub gate.
    - Verify: `pnpm --filter web test`; `pnpm test:e2e`
    - Files: `apps/web/src/features/chat/message-image-view.tsx`,
      `apps/web/src/features/chat/message-file-view.tsx`,
      `apps/api/src/modules/artifacts/scan-stub.service.ts`,
      `tests/e2e/inline-attachments.spec.tsx`
  
  ### Phase 16: Artifact Iteration
  
  - [x] Task 52: Artifact version history
    - Acceptance: Each artifact persists an immutable revision chain; users can
      view the diff between consecutive revisions; the underlying contracts are
      forward-compatible with the deferred multi-author edit flow.
    - Verify: `pnpm --filter api test`; `pnpm test:integration`
    - Files: `db/migrations/0012_artifact_revisions.sql`,
      `apps/api/src/modules/artifacts/revisions.service.ts`,
      `packages/contracts/src/artifact-revision.ts`,
      `tests/integration/artifact-revisions.spec.ts`
  
  - [x] Task 53: In-chat code editor for artifact follow-up edits
    - Acceptance: Users can open a code artifact in an embedded editor, make
      inline edits, and dispatch a "modify this artifact" instruction back to
      the responsible agent; the round-trip persists a new revision.
    - Verify: `pnpm --filter web test`; `pnpm test:e2e`
    - Files: `apps/web/src/features/artifacts/code-editor-overlay.tsx`,
      `apps/web/src/features/chat/artifact-edit-dispatcher.tsx`,
      `tests/e2e/artifact-code-editor.spec.tsx`
  
  - [x] Task 54: Rich diff card and conflict resolution path
    - Acceptance: The Diff card renders the actual before/after view inline,
      supports per-hunk apply/reject, and surfaces conflicts when two users
      modify the same artifact concurrently inside a shared conversation.
    - Verify: `pnpm --filter web test`; `pnpm test:e2e`
    - Files: `apps/web/src/features/artifacts/diff-card.tsx`,
      `apps/web/src/features/artifacts/diff-conflict-resolver.tsx`,
      `apps/api/src/modules/artifacts/conflict-detector.service.ts`,
      `tests/e2e/diff-card-rich.spec.tsx`
  
  ### Phase 17: Heavy Custom Agent Visual Management
  
  - [x] Task 55: Heavy agent definition UI
    - Acceptance: A workspace member with the right permission can register a
      heavy custom agent through the web UI by selecting tool bindings,
      runtime mode, and provider; the underlying registry contract from
      Release 1 stays unchanged.
    - Verify: `pnpm --filter web test`; `pnpm test:e2e`
    - Files: `apps/web/src/features/agents/heavy-agent-form.tsx`,
      `apps/web/src/features/agents/tool-binding-picker.tsx`,
      `tests/e2e/heavy-agent-management.spec.tsx`
  
  - [x] Task 56: Tool runtime sandboxing and resource caps
    - Acceptance: Server-side tool execution runs in a sandboxed worker with
      CPU, memory, network, and timeout caps; misbehaving tools are surfaced
      through `mapToPublicError` and recorded in observability counters.
    - Verify: `pnpm --filter @agenthub/tool-runtime test`; `pnpm test:integration`
    - Files: `packages/tool-runtime/src/sandbox.ts`,
      `packages/tool-runtime/src/resource-policy.ts`,
      `tests/integration/tool-runtime-sandbox.spec.ts`
  
  - [x] Task 57: Heavy agent observability surface
    - Acceptance: Each heavy agent execution is traced under a dedicated span
      family; counters expose cold-start, tool-invocation, and quota-exceeded
      metrics; the workspace audit log records every heavy agent registration
      and update.
    - Verify: `pnpm --filter api test`; `pnpm test:integration`
    - Files: `apps/api/src/modules/tools/heavy-agent-metrics.service.ts`,
      `tests/integration/heavy-agent-observability.spec.ts`
  
  ## Release 4: Deployment And Publishing
  
  Goal: deliver the original requirements §5 (`Deploy publishing`) and the
  deploy-status card surface that was P2 in source and Deferred in SPEC.md.
  
  ### Phase 18: Deploy Pipeline Foundation
  
  - [x] Task 58: Add a deploy-target abstraction and credential vault entries
    - Acceptance: The platform persists deploy targets per workspace (static
      site, container, source-archive) with the same `credential_source`
      abstraction used for provider credentials.
    - Verify: `pnpm --filter api test`; `pnpm test:integration`
    - Files: `db/migrations/0014_deploy_targets.sql`,
      `apps/api/src/modules/deploys/targets.service.ts`,
      `packages/contracts/src/deploy-target.ts`,
      `tests/integration/deploy-targets.spec.ts`
  
  - [x] Task 59: Deploy execution workflow on the worker
    - Acceptance: A `deployArtifactWorkflow` runs a deploy job for a chosen
      target, emits structured progress events, and persists the resulting
      deployment record.
    - Verify: `pnpm --filter worker test`; `pnpm test:integration`
    - Files: `db/migrations/0015_deployments.sql`,
      `apps/worker/src/workflows/deploy-artifact.workflow.ts`,
      `apps/worker/src/activities/deploy-static-site.activity.ts`,
      `apps/worker/src/activities/deploy-container.activity.ts`,
      `tests/integration/deploy-workflow.spec.ts`
  
  ### Phase 19: Deploy Status Card And Chat Wiring
  
  - [x] Task 60: Deploy command parser and dispatch
    - Acceptance: A user can type `/deploy <target>` (or use a button) inside a
      chat composer; the command dispatches the deploy workflow and renders a
      deploy-status card linked to the artifact under discussion.
    - Verify: `pnpm --filter web test`; `pnpm test:e2e`
    - Files: `packages/contracts/src/deploy-command.ts`,
      `apps/api/src/modules/deploys/deploys.controller.ts`,
      `apps/api/src/modules/deploys/dispatch.service.ts`,
      `apps/web/src/features/chat/deploy-command.tsx`,
      `apps/web/src/features/artifacts/deploy-status-card.tsx`,
      `tests/e2e/deploy-command.spec.tsx`
  
  - [x] Task 61: Preview URL provisioning
    - Acceptance: Successful static-site and container deploys produce a
      preview URL that is reachable from the deploy-status card; URLs are
      workspace-scoped and rotate on revocation.
    - Verify: `pnpm test:integration`; `pnpm test:e2e`
    - Files: `apps/api/src/modules/deploys/deploys.controller.ts`,
      `apps/api/src/modules/deploys/preview-url.service.ts`,
      `infra/k8s/preview-ingress.yaml`,
      `tests/integration/preview-url.spec.ts`
  
  ## Release 5: Multi-Platform Clients
  
  Goal: deliver the desktop and mobile clients SPEC.md flagged as Deferred
  without forking the contracts package or the API surface.
  
  ### Phase 20: Desktop Client
  
  - [x] Task 62: Desktop application shell
    - Acceptance: A `Tauri` (or `Electron`) shell embeds the existing web
      bundle, provides system notifications, and exposes a local-file picker
      that hands files to the existing artifact upload flow.
    - Verify: `pnpm --filter desktop build`; `pnpm --filter desktop test`
    - Files: `apps/desktop/package.json`,
      `apps/desktop/src/main.ts`,
      `apps/desktop/src/system-notifications.ts`,
      `apps/desktop/src/file-bridge.ts`,
      `apps/desktop/test/system-notifications.spec.ts`
  
  - [x] Task 63: Local agent process supervision
    - Acceptance: The desktop client can run user-configured local agent
      processes, surface their lifecycle through the workspace audit log, and
      forward their tool calls through the shared tool runtime contract.
    - Verify: `pnpm --filter desktop test`; `pnpm test:e2e`
    - Files: `apps/desktop/package.json`,
      `apps/desktop/src/agent-supervisor.ts`,
      `apps/desktop/src/tool-bridge.ts`,
      `apps/desktop/test/agent-supervisor.spec.ts`,
      `tests/e2e/desktop-agent-supervisor.spec.tsx`
  
  ### Phase 21: Mobile Client
  
  - [x] Task 64: Mobile shell with read-and-approve flows
    - Acceptance: A mobile client (Expo or React Native) lets users browse
      conversations, approve outgoing actions surfaced as approval cards, and
      preview attachments. Heavy editing remains a desktop/web concern.
    - Verify: `pnpm --filter mobile test`
    - Files: `apps/mobile/package.json`,
      `apps/mobile/src/screens/conversation-list.tsx`,
      `apps/mobile/src/screens/conversation-thread.tsx`,
      `apps/mobile/src/components/approval-card.tsx`,
      `apps/mobile/test/approval-card.spec.tsx`
  
  - [x] Task 65: Mobile push-notification gateway
    - Acceptance: Push notifications are delivered for assigned-to-me events,
      approval requests, and orchestrator-failure escalations; the gateway is
      workspace-aware and respects per-user notification preferences.
    - Verify: `pnpm --filter mobile test`; `pnpm test:integration`
    - Files: `apps/api/src/modules/notifications/push-gateway.service.ts`,
      `apps/mobile/src/notifications/push-bridge.ts`,
      `apps/mobile/test/push-bridge.spec.tsx`,
      `tests/integration/push-notifications.spec.ts`
  
  ## Release 6: Platform-Managed Credentials And Quota
  
  Goal: activate the `platform_managed` provider credential mode that was kept
  as a strategic deferred capability in the Release 1 schema.
  
  ### Phase 22: Credential Pool And Quota
  
  - [x] Task 66: Credential pool data model
    - Acceptance: The platform persists pool-managed provider credentials
      keyed by provider, region, tier, and quota class; pool selection is
      deterministic and observable.
    - Verify: `pnpm --filter api test`; `pnpm test:integration`
    - Files: `db/migrations/0016_credential_pool.sql`,
      `apps/api/src/modules/credentials/pool.service.ts`,
      `packages/contracts/src/credential-pool.ts`,
      `apps/api/test/credential-pool.e2e-spec.ts`,
      `tests/integration/credential-pool.spec.ts`
  
  - [x] Task 67: Per-workspace quota enforcement
    - Acceptance: Workspace consumption of platform-managed credentials is
      recorded per provider and per period; quota breaches map to a
      `quota_exceeded` public error code; renewals are scheduled.
    - Verify: `pnpm --filter api test`; `pnpm test:integration`
    - Files: `db/migrations/0017_workspace_provider_quota_periods.sql`,
      `apps/api/src/modules/quota/quota.service.ts`,
      `apps/api/src/modules/quota/quota.module.ts`,
      `packages/domain/src/errors/public-error-mapper.ts`,
      `apps/api/test/quota.e2e-spec.ts`,
      `tests/integration/quota-enforcement.spec.ts`
  
  - [x] Task 68: Mode switch surface
    - Acceptance: A workspace owner can opt a workspace into the
      platform-managed mode for a provider when policy allows; the BYOK path
      remains the default and continues to pass the Release 1 acceptance.
    - Verify: `pnpm --filter web test`; `pnpm test:e2e`
    - Files: `db/migrations/0018_workspace_provider_credential_modes.sql`,
      `apps/api/src/modules/credentials/credentials.service.ts`,
      `apps/api/src/modules/credentials/credentials.controller.ts`,
      `apps/web/src/features/setup/credential-mode-toggle.tsx`,
      `apps/web/src/features/setup/setup-flow.tsx`,
      `tests/e2e/credential-mode-switch.spec.tsx`
  
  ## Cross-Cutting Hardening Track
  
  These tasks are not gated to a single release; each one removes a Release 1
  shortcut that diverged from `SPEC.md` while still keeping the existing
  acceptance criteria green.
  
  - [x] Task H-01: Replace the in-house JSON logger with `Pino`
    - Acceptance: `apps/api` and `apps/worker` emit Pino logs with redaction,
      serialization, and child-logger semantics; the existing log fields and
      levels are preserved.
    - Verify: `pnpm --filter api test`; `pnpm --filter worker test`
    - Files: `apps/api/src/observability/structured-logger.service.ts`,
      `apps/worker/src/observability/observability.ts`,
      `apps/api/test/observability.e2e-spec.ts`,
      `apps/worker/test/observability.spec.ts`
  
  - [x] Task H-02: Wire real OpenTelemetry tracing
    - Acceptance: API and worker use the OpenTelemetry SDK, export to OTLP, and
      keep the existing `trace.span.start`/`end` log lines as a fallback.
    - Verify: `pnpm --filter api test`; `pnpm --filter worker test`
    - Files: `packages/observability-otel/src/index.ts`,
      `apps/api/src/observability/observability.module.ts`,
      `apps/api/src/observability/trace-recorder.service.ts`,
      `apps/worker/src/observability/observability.ts`,
      `apps/api/test/observability.e2e-spec.ts`,
      `apps/worker/test/observability.spec.ts`
  
  - [x] Task H-03: Add Sentry-equivalent error capture
    - Acceptance: Unhandled exceptions in API and worker are forwarded to the
      error capture sink with workspace, conversation, and trace context.
    - Verify: `pnpm --filter api test`; `pnpm test:integration`
    - Files: `packages/observability-errors/src/index.ts`,
      `apps/api/src/observability/error-reporter.service.ts`
  
  - [x] Task H-04: Move the rate-limit service onto Redis
    - Acceptance: `RateLimitService` reads and writes its buckets through Redis;
      the in-process implementation is retained as a test double.
    - Verify: `pnpm --filter api test`; `pnpm test:integration`
    - Files: `apps/api/src/modules/limits/rate-limit.service.ts`,
      `apps/api/src/modules/limits/redis-rate-limit.repository.ts`,
      `apps/api/test/rate-limit.e2e-spec.ts`,
      `tests/integration/rate-limit.spec.ts`
  
  - [x] Task H-05: Migrate API services to Drizzle ORM
    - Acceptance: Conversations, messages, custom agents, credentials, and
      artifacts are queried through Drizzle. Raw `pg` access is allowed only
      for migrations and exotic stream cursors.
    - Verify: `pnpm --filter api test`; `pnpm test:integration`
    - Files: `apps/api/src/modules/database/database.service.ts`,
      `apps/api/src/modules/conversations/conversations.repository.ts`,
      `apps/api/src/modules/messages/messages.repository.ts`
  
  - [x] Task H-06: Add `pgBouncer` in front of PostgreSQL
    - Acceptance: The Docker compose stack and Kubernetes manifests route the
      API and worker through `pgBouncer`; the `DATABASE_URL` continues to be
      a single environment variable.
    - Verify: `docker compose -f infra/docker/compose.dev.yml up -d`; `pnpm test:integration`
    - Files: `infra/docker/compose.dev.yml`,
      `infra/k8s/pgbouncer.yaml`,
      `docs/operations/pgbouncer.md`
  
  - [x] Task H-07: Adopt `Tailwind CSS` and a shadcn-style UI baseline
    - Acceptance: The web client is rebuilt against Tailwind tokens; existing
      chat, setup, and agents specs continue to pass after the migration.
    - Verify: `pnpm --filter web build`; `pnpm --filter web test`; `pnpm test:e2e`
    - Files: `apps/web/tailwind.config.ts`,
      `apps/web/src/app/globals.css`,
      `apps/web/src/components/**/*.tsx`
  
  - [x] Task H-08: Replace vitest+jsdom e2e with `Playwright`
    - Acceptance: The e2e suite runs against a real browser using Playwright,
      targeting the same scenarios as the existing `tests/e2e/*.spec.tsx`
      files; the in-process spec files are kept as smoke tests.
    - Verify: `pnpm test:e2e`
    - Files: `playwright.config.ts`,
      `tests/e2e-playwright/*.spec.ts`,
      `docs/operations/e2e-playwright.md`
  
  - [x] Task H-09: Add Supertest API contract tests
    - Acceptance: Critical API contracts (auth, workspaces, messages,
      artifacts, credentials) have Supertest-driven contract tests covering
      happy paths and permission boundaries.
    - Verify: `pnpm --filter api test`; `pnpm test:integration`
    - Files: `apps/api/test/auth.contract-spec.ts`,
      `apps/api/test/workspaces.contract-spec.ts`,
      `apps/api/test/messages.contract-spec.ts`
  
  - [x] Task H-10: Run real-SaaS provider acceptance against staging
    - Acceptance: A staging-only k6 / vitest pipeline runs `tests/e2e/*-real.spec.ts`
      against the real `Hermes`, `OpenClaw`, `Codex`, and `Claude Code`
      endpoints with rotated BYOK credentials; results are stored in
      `docs/operations/load-test-results.md` and `docs/operations/release-checklist.md`.
    - Verify: `pnpm test:e2e` with the production env vars set
    - Files: `docs/operations/release-checklist.md`,
      `docs/operations/provider-acceptance.md`,
      `ai/logs/release-readiness.md`
  
  ## Parallel-Safe Windows
  
  - Phase 11 must finish before any other Release 2 phase because every later
    task assumes an authenticated user.
  - Phases 12 and 13 can be started in parallel after Phase 11 lands; Phase 14
    depends on both.
  - Inside Release 3, Phases 15 and 17 are parallel-safe; Phase 16 should land
    before Phase 17 so heavy custom agents can register tools that produce
    versioned artifacts.
  - Hardening tasks `H-01`, `H-02`, `H-03`, and `H-05` are parallel-safe and
    can be picked up between feature releases.
  - `H-07` (Tailwind) is best paired with Release 3 to avoid double UI rework.
  - `H-08` (Playwright) should land before Release 5 so desktop and mobile
    flows can reuse the harness.
  
  ## Exit Conditions
  
  A given release is considered complete only when all of the following are
  true:
  
  - Every task in the release is checked off.
  - The acceptance criteria of every Release 1 task continue to pass.
  - The release-readiness checklist (`docs/operations/release-checklist.md`)
    is amended with the new release's evidence.
  - A slice log is added under `ai/logs/` summarizing the release outcome.
  
  ## Tracking And Reporting
  
  - Each phase ships an `ai/logs/<date>-<slice>-slice.md` file mirroring the
    Release 1 log conventions.
  - The cross-cutting track tasks (`H-XX`) are tracked in
    `docs/operations/release-checklist.md` rather than in a per-release slice
    log so they can be promoted into a release whenever they finish.
  - Open risks identified during a release land in
    `ai/logs/release-readiness.md` with an explicit owner.
  
  Quick gap-analysis recap so it is clear how this plan tracks back to docs/product/original-requirements.md:
  
  - Done in Release 1: IM single-agent + group orchestration, BYOK with all four real providers, custom-agent
  registry + tool runtime, baseline artifact cards, observability + guardrails + load harness.
  - Mandatory deferred → Releases 2-5: login, workspaces, roles, shared conversations and audit (R2); IM polish,
  artifact editing/version history, heavy custom-agent UI (R3); deploy publishing (R4); desktop and mobile
  clients (R5).
  - Strategic deferred → Release 6: platform_managed credential mode + quota.
  - Hardening track: Pino, real OpenTelemetry, Sentry, Drizzle, pgBouncer, Tailwind, Playwright, Supertest,
  Redis-backed rate limit, real-SaaS acceptance — interleaved across releases.
  
  Once the file-write tool is available again, tell me and I will drop this content into
  /home/torch/miaochat/ai/tasks/post-release-1-roadmap-tasks.md and re-run the spec checks.
