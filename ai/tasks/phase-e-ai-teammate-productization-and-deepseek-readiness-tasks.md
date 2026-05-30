# Tasks: Phase E AI Teammate Productization And DeepSeek Readiness

## Phase 0: Trust And Context Correctness

- [x] Task E00: Fix channel tab context preservation
  - Acceptance:
    - Opening a channel chat tab and file tab shows the same channel title,
      member counts, workspace state, and tab-independent header.
    - Query string changes only change the selected tab, not the loaded channel
      entity.
  - Verify:
    - E2E test for `/channels/:id` and `/channels/:id?tab=files`.
    - Component test for channel-shell loading with tab changes.
  - Files:
    - `apps/web/src/features/channels/**`
    - `apps/api/src/modules/workspace-shell/**`
    - `tests/e2e/**`
  - Scope: M

- [x] Task E00A: Enforce active workspace as the single source of truth
  - Acceptance:
    - Settings, credentials/model connections, channel pages, and workspace
      settings all render the same active workspace.
    - Components no longer silently display fallback workspace IDs after the
      active workspace has loaded.
    - Development mode surfaces an obvious warning or test failure for fallback
      workspace usage in authenticated pages.
  - Verify:
    - E2E tests for settings workspace, model connection settings, and channel
      pages.
    - Component tests for workspace switcher fallback behavior.
  - Files:
    - `apps/web/src/features/workspaces/**`
    - `apps/web/src/features/settings/**`
    - `apps/web/src/features/channels/**`
    - `apps/api/src/modules/workspaces/**`
    - `tests/e2e/**`
  - Scope: M

## Phase 1: Vocabulary And Contract Reset

- [x] Task E01: Inventory all customer-visible backend/provider leakage
  - Acceptance:
    - A full inventory exists for UI copy, settings labels, teammate creation,
      workflow summaries, metadata, seeded content, product docs, error copy,
      route titles, status labels, and empty states.
    - Each leak is tagged as `must remove now`, `internal only`, or `follow-up`.
    - The inventory also flags architecture-explanation copy that should move
      out of daily-use product pages.
  - Verify:
    - Manual review of the inventory document.
  - Files:
    - `apps/web/src/**`
    - `apps/api/src/**`
    - `packages/contracts/src/**`
    - `docs/product/**`
    - `docs/architecture/**`
  - Scope: M

- [x] Task E02: Define the new public vocabulary and connection model
  - Acceptance:
    - Customer-facing nouns are frozen.
    - `模型连接` replaces provider-centric wording in public contracts.
    - A public `DeepSeek`-first connection object is defined.
    - Page-level copy rules distinguish onboarding explanation from daily-use
      workspace UI.
  - Verify:
    - Contract review in `packages/contracts`.
    - Spec and plan reference the same nouns.
  - Files:
    - `packages/contracts/src/**`
    - `docs/product/**`
    - `docs/architecture/**`
  - Scope: M

- [x] Task E03: Design the migration boundary from old credentials to new model connections
  - Acceptance:
    - A migration strategy exists for persistence, API shape, and UI adoption.
    - The plan states whether old records are wrapped, translated, or migrated.
  - Verify:
    - Architecture note reviewed.
  - Files:
    - `docs/architecture/**`
    - `apps/api/src/modules/credentials/**`
    - `packages/contracts/src/**`
  - Scope: M

- [x] Task E03A: Define compact workspace shell rules
  - Acceptance:
    - Logged-in pages have a compact top bar, one primary action area, and no
      repeated hero-style product explanation.
    - Left navigation uses concise labels, badges, and tooltips instead of
      permanent subtitles.
    - Account/settings entry points are not duplicated.
  - Verify:
    - Shell component review.
    - Visual acceptance checklist for workbench, inbox, tasks, calendar,
      channels, settings.
  - Files:
    - `apps/web/src/components/**`
    - `apps/web/src/features/**`
    - `docs/product/**`
  - Scope: M

## Checkpoint: Trust And Contract Freeze

- [x] Channel tabs preserve entity context
- [x] Settings sections preserve active workspace context
- [x] Customer-facing naming is frozen
- [x] A DeepSeek-first public connection shape is agreed
- [x] The old credential model has a documented transition path
- [x] Daily-use shell rules are defined

## Phase 2: Workbench And Core Tool Pages

- [x] Task E04: Reframe the workbench as launcher and resume surface
  - Acceptance:
    - Workbench no longer duplicates a full active channel chat surface.
    - It shows current work mode, recommended teammate set, recent channels,
      pending items, and start/continue actions.
    - Future modes are visually lower priority until they are usable.
    - Connection state has a clear next action.
  - Verify:
    - Component tests for workbench states.
    - Manual browser check after login.
  - Files:
    - `apps/web/src/features/chat/**`
    - `apps/web/src/features/workmodes/**`
    - `apps/web/src/features/channels/**`
  - Scope: M

- [x] Task E05: Turn inbox into a real handling queue
  - Acceptance:
    - Inbox supports type filters, unread/resolved state, queue/list area,
      detail area, and actions.
    - Supported item types include mentions, approvals, task updates, calendar
      updates, run failures, and connection alerts.
    - Empty state offers direct next actions.
  - Verify:
    - Component tests for filters, empty state, and detail selection.
    - Contract tests for inbox item shape.
  - Files:
    - `apps/web/src/features/inbox/**`
    - `apps/api/src/modules/workspace-shell/**`
    - `packages/contracts/src/**`
  - Scope: M

- [x] Task E06: Turn tasks into a usable list and board tool
  - Acceptance:
    - Tasks page supports create, search, status filter, priority filter, owner
      filter, scope filter, due-date filter, list view, and board view.
    - List and board views have visibly different layouts.
    - Empty state has a create-task action.
  - Verify:
    - Component tests for view switch, filters, and create entry.
    - Contract tests for task scope and status.
  - Files:
    - `apps/web/src/features/tasks/**`
    - `apps/api/src/modules/workspace-shell/**`
    - `packages/contracts/src/**`
  - Scope: M

- [x] Task E07: Turn calendar into a real time tool
  - Acceptance:
    - Calendar supports month, week, and day grids.
    - It includes today, previous, next navigation and event creation.
    - It supports user and AI teammate calendar toggles.
    - Events can reference task, channel message, or approved plan sources.
  - Verify:
    - Component tests for view switching, date navigation, and create event
      entry.
    - Contract tests for calendar event shape.
  - Files:
    - `apps/web/src/features/calendar/**`
    - `apps/api/src/modules/workspace-shell/**`
    - `packages/contracts/src/**`
  - Scope: M

- [x] Task E08: Turn channel overview into a management surface
  - Acceptance:
    - Channel overview supports search, create channel, active/archived/my
      channels/failure filters, sorting, and shortcut actions.
    - It no longer repeats the same information density as the workbench.
  - Verify:
    - Component tests for search, filters, sorting, and shortcut rendering.
  - Files:
    - `apps/web/src/features/channels/**`
    - `apps/api/src/modules/workspace-shell/**`
  - Scope: M

- [x] Task E09: Add channel timeline recovery actions and calmer message actions
  - Acceptance:
    - Failed run events expose retry, technical details, model connection,
      create recovery task, and fallback-safe actions where allowed.
    - Stream state distinguishes connected, reconnecting, failed, and idle.
    - Pin and secondary message actions are visually reduced.
    - Composer clearly shows selected teammates and their availability.
  - Verify:
    - Component tests for failed event actions, stream states, and composer
      target state.
  - Files:
    - `apps/web/src/features/channels/**`
    - `apps/web/src/features/chat/**`
    - `packages/contracts/src/**`
  - Scope: M

## Checkpoint: Core Tool Pages Ready

- [x] Workbench starts/resumes work without duplicating full channel chat
- [x] Inbox has queue, filters, detail, and actions
- [x] Tasks has create/search/filter/list/board
- [x] Calendar has real time grid and event creation
- [x] Channel overview has search/create/filter/sort/actions
- [x] Channel timeline failures have recovery actions

## Phase 3: Settings And DeepSeek Connection Flow

- [x] Task E10: Redesign settings information architecture around `模型连接`
  - Acceptance:
    - Settings no longer present the main setup path as a provider catalog.
    - A dedicated `模型连接` section is defined.
    - The user journey for adding a DeepSeek key is explicit.
    - Settings sections are grouped as account, workspace, and AI platform.
    - Settings pages prioritize status and controls over explanatory prose.
  - Verify:
    - UI-state walkthrough documented.
  - Files:
    - `apps/web/src/features/settings/**`
    - `apps/web/src/features/setup/**`
  - Scope: M

- [x] Task E11: Define the DeepSeek connection contract and validation path
  - Acceptance:
    - Input, response, and validation-state contracts are defined.
    - Connection test behavior is specified against the live DeepSeek endpoint.
    - Workspace default semantics are defined.
  - Verify:
    - Contract tests planned.
    - Error cases enumerated.
  - Files:
    - `packages/contracts/src/**`
    - `apps/api/src/modules/credentials/**`
    - `tests/integration/**`
  - Scope: M

- [x] Task E12: Define model presets and advanced fields for DeepSeek
  - Acceptance:
    - Default model presets are specified for `高性能` and `快速`.
    - Advanced fields are clearly marked and limited.
    - The plan avoids locking new UI language to legacy model aliases.
  - Verify:
    - Product doc review.
  - Files:
    - `docs/product/**`
    - `apps/web/src/features/settings/**`
    - `packages/contracts/src/**`
  - Scope: S

- [x] Task E13: Model disabled reasons and connection-state copy
  - Acceptance:
    - Disabled save/validate controls explain missing label, missing key, not
      validated, workspace mismatch, insufficient permission, and service
      failure states.
    - English status labels are replaced with consistent Chinese product copy.
  - Verify:
    - Component tests for each disabled reason.
    - API error mapping tests for connection validation.
  - Files:
    - `apps/web/src/features/settings/**`
    - `apps/web/src/features/setup/**`
    - `apps/api/src/modules/credentials/**`
    - `packages/contracts/src/**`
  - Scope: M

## Checkpoint: Settings Ready

- [x] DeepSeek connection flow is fully specified
- [x] Validation semantics are explicit
- [x] Workspace default behavior is defined
- [x] Disabled controls explain what is missing

## Phase 4: Teammate Creation Redesign

- [x] Task E14: Replace the current template catalog with customer-facing teammate templates
  - Acceptance:
    - The catalog includes recommended templates plus `自定义`.
    - Template summaries talk about work, not runtime origin.
  - Verify:
    - Template matrix reviewed.
  - Files:
    - `apps/web/src/features/teammates/**`
    - `docs/product/**`
  - Scope: S

- [x] Task E15: Remove `运行策略` and replace it with a richer setup structure
  - Acceptance:
    - The old step is removed from the user journey.
    - New step structure is defined around tools, memory, approvals, model
      preference, and output style.
  - Verify:
    - Wizard flow review.
  - Files:
    - `apps/web/src/features/teammates/**`
    - `packages/contracts/src/**`
  - Scope: M

- [x] Task E16: Define teammate-profile schema for high customization without backend leakage
  - Acceptance:
    - Teammate profiles can store role, scope, tool permissions, memory mode,
      approval mode, model preference, and delivery style.
    - No public field exposes hidden backend names.
  - Verify:
    - Schema review.
    - Contract tests planned.
  - Files:
    - `packages/contracts/src/**`
    - `apps/api/src/modules/custom-agents/**`
    - `apps/web/src/features/teammates/**`
  - Scope: M

- [x] Task E17: Split teammate creation into simple path and advanced settings
  - Acceptance:
    - Simple creation includes template, name, role, channel membership, and
      create action.
    - Advanced settings contain tools, memory, approvals, model preference, and
      output style.
    - Advanced settings do not appear as a required runtime-choice step.
  - Verify:
    - Wizard state-machine tests.
    - Browser smoke for simple-create path.
  - Files:
    - `apps/web/src/features/teammates/**`
    - `packages/contracts/src/**`
  - Scope: M

- [x] Task E18: Make template selection visibly prefill teammate fields
  - Acceptance:
    - Selecting a template immediately updates name, role description,
      suggested tools, memory defaults, and output style.
    - Confirmation page uses user-language summaries, not internal field names.
    - Disabled create action explains missing fields.
  - Verify:
    - Component tests for template prefill and disabled reasons.
  - Files:
    - `apps/web/src/features/teammates/**`
  - Scope: M

- [x] Task E19: Design teammate summaries, cards, and edit surfaces
  - Acceptance:
    - Saved teammate cards summarize capabilities without runtime leakage.
    - Edit surfaces reflect the new wizard structure.
  - Verify:
    - Component-state review.
  - Files:
    - `apps/web/src/features/teammates/**`
    - `apps/web/src/features/agents/**`
    - `apps/api/src/modules/workspace-shell/**`
  - Scope: M

## Checkpoint: Teammate Creation Ready

- [x] `自定义` exists
- [x] `运行策略` is gone from the customer journey
- [x] Rich teammate profile fields are frozen
- [x] Simple creation and advanced settings are separated
- [x] Template selection visibly prefills fields

## Phase 5: Workspace Administration Surfaces

- [x] Task E20: Expand account profile settings into a credible account surface
  - Acceptance:
    - Profile settings include name, avatar, email, language, timezone, theme,
      notification preference, connected accounts, and session/security areas.
    - Unsupported fields can be read-only or placeholder, but the page must not
      read as a login-status-only panel.
  - Verify:
    - Component tests for account sections.
  - Files:
    - `apps/web/src/features/settings/**`
    - `packages/contracts/src/**`
  - Scope: M

- [x] Task E21: Expand member management beyond a static directory
  - Acceptance:
    - Member records expose actor type, role, status, invited/active/disabled
      state, joined time, and last active time.
    - UI includes invite, role management, disable, and ownership-transfer
      planning entry points.
  - Verify:
    - Component tests for human and AI member rows.
    - Contract tests for member status fields.
  - Files:
    - `apps/web/src/features/settings/**`
    - `apps/api/src/modules/workspace-shell/**`
    - `packages/contracts/src/**`
  - Scope: M

- [x] Task E22: Replace billing placeholder with usable billing skeleton
  - Acceptance:
    - Billing shows current plan, usage, quota, model cost breakdown, member
      count, AI teammate count, invoices, payment method, and upgrade action.
    - It clearly distinguishes user-provided model keys from future
      platform-managed usage.
  - Verify:
    - Component tests for billing empty and populated states.
  - Files:
    - `apps/web/src/features/settings/**`
    - `packages/contracts/src/**`
  - Scope: M

- [x] Task E23: Turn capability management into install/enable management skeleton
  - Acceptance:
    - Capability cards include name, source, version, compatible roles,
      permission scope, install state, enabled state, and risk notes.
    - The page supports install/enable/disable UI states even if backend actions
      are initially mocked or disabled.
  - Verify:
    - Component tests for capability state rendering.
  - Files:
    - `apps/web/src/features/settings/**`
    - `apps/api/src/modules/workspace-shell/**`
    - `packages/contracts/src/**`
  - Scope: M

## Checkpoint: Administration Surfaces Ready

- [x] Account page is more than login status
- [x] Member management exposes roles and status
- [x] Billing has a credible management skeleton
- [x] Capability management exposes install, enable, permission, and risk state

## Phase 6: Runtime And Workflow Integration

- [x] Task E24: Define hidden mapping from teammate profile + workspace connection to execution backend
  - Acceptance:
    - A server-only resolution contract exists.
    - Public payloads stay neutral while the worker still receives enough data to execute.
  - Verify:
    - Architecture review.
  - Files:
    - `apps/api/src/modules/coding-workflows/**`
    - `apps/worker/src/activities/**`
    - `docs/architecture/**`
  - Scope: M

- [x] Task E25: Specify how coding workflow launch consumes the new teammate profile
  - Acceptance:
    - Workflow launch input includes teammate selections and optional custom
      teammate additions without exposing backend identity.
    - Planning, implementation, review, and testing roles still behave predictably.
  - Verify:
    - Integration test cases listed.
  - Files:
    - `packages/contracts/src/**`
    - `apps/api/src/modules/coding-workflows/**`
    - `apps/web/src/features/workmodes/**`
  - Scope: M

- [x] Task E26: Define product-safe DeepSeek error handling
  - Acceptance:
    - Settings errors, connection validation failures, rate limits, and workflow
      execution failures all have product-safe copy.
    - No transport/provider-specific jargon leaks into user-facing text.
  - Verify:
    - Error-state matrix reviewed.
  - Files:
    - `apps/web/src/**`
    - `apps/api/src/**`
    - `docs/product/**`
  - Scope: M

## Checkpoint: Runtime Ready

- [x] Coding workflow can resolve a DeepSeek connection
- [x] Hidden runtime mapping is defined
- [x] Product-safe error surfaces are specified

## Phase 7: UI Polish And Real Acceptance

- [x] Task E27: Fix the workspace switcher overflow and sidebar pill behavior
  - Acceptance:
    - Long workspace names no longer overflow their container.
    - Narrow sidebar behavior remains stable and readable.
    - Workspace selector has max-width, truncation, tooltip/full-name access,
      and stable focus/hover dimensions.
  - Verify:
    - Component test plan.
    - Visual acceptance notes.
  - Files:
    - `apps/web/src/features/workspaces/workspace-switcher.tsx`
    - `apps/web/src/components/**`
  - Scope: S

- [x] Task E28: Scrub legacy product docs, demo text, and seeded content
  - Acceptance:
    - Product-facing docs align with the new `AI 同事 + 模型连接 + DeepSeek`
      story.
    - No user-facing seeded text leaks legacy backend naming.
  - Verify:
    - `rg` audit for legacy public names in customer-facing surfaces.
  - Files:
    - `docs/product/**`
    - `scripts/demo/**`
    - `apps/web/src/**`
  - Scope: M

- [x] Task E29: Plan and execute real-key DeepSeek acceptance for collaborative coding
  - Acceptance:
    - A real-key acceptance checklist exists.
    - Required browser, API, and workflow checks are spelled out.
    - Completion criteria explicitly require a successful planning -> approval ->
      implementation -> review -> testing sequence.
  - Verify:
    - Acceptance runbook drafted.
    - E2E and integration cases listed.
  - Files:
    - `tests/integration/**`
    - `tests/e2e/**`
    - `docs/product/**`
    - `docs/operations/**`
  - Scope: M

- [x] Task E30: Add page-level smoke coverage for all daily-use surfaces
  - Acceptance:
    - Workbench, inbox, tasks, calendar, channel overview, channel detail,
      settings, teammate creation, billing, and capability management have smoke
      tests for title, primary action, empty state, and active workspace.
  - Verify:
    - E2E smoke suite passes.
    - `pnpm --filter web build` passes.
  - Files:
    - `tests/e2e/**`
    - `apps/web/src/**`
  - Scope: M

## Checkpoint: Phase Complete

- [x] Customer-visible backend/provider names are scrubbed
- [x] DeepSeek settings path is fully specified
- [x] Teammate creation is rich and runtime-neutral
- [x] Real-key collaborative coding acceptance is defined
- [x] Channel and workspace context correctness is proven
- [x] Core pages are usable tools with primary actions
- [x] Admin surfaces have credible skeletons
