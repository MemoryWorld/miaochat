# Spec Snapshot: Phase E AI Teammate Productization And DeepSeek Readiness

Drafted on `2026-05-30` after `Phase D` closed and the product direction shifted
from runtime exposure toward a customer-facing `AI 同事` experience.

## Assumptions

1. This phase is planning-only. No application code changes are part of this
   snapshot.
2. Customer-facing surfaces must stop exposing execution-backend brand names.
   The product language should consistently speak in terms of `AI 同事`,
   `模型连接`, `工作区`, `频道`, `任务`, and `审批`.
3. The first real external model connection in scope is `DeepSeek` only. The
   user plans to test with a real DeepSeek API key on `2026-05-30`, so this
   phase must end with a realistic path to run collaborative coding against a
   live key.
4. A second internal coding backend is expected later, but its source directory
   is not currently present in the local workspace. This phase therefore plans
   a hidden backend boundary, not a second live implementation.
5. The existing runtime foundation, workflow engine, and channel timeline stay
   in place. This phase is a productization and interface-contract shift, not a
   ground-up rewrite.
6. The page audit delivered on `2026-05-30` expands Phase E beyond model
   connection and teammate creation. Core workspace pages must become usable
   tools, not explanation-heavy placeholders.

## Objective

Turn the current workspace into a customer-credible `AI 同事` product by:

- removing customer-visible backend/provider branding
- redesigning teammate creation around rich per-agent customization
- replacing provider-centric setup with a `DeepSeek` API connection flow
- fixing the workspace switcher overflow defect
- proving that coding collaboration works end-to-end with a real DeepSeek key
- fixing workspace/channel context correctness issues before adding more
  surface area
- turning inbox, tasks, calendar, channels, settings, members, billing, and
  capability management into coherent tool surfaces

Success means a customer can:

1. enter the product without seeing hidden runtime brand names
2. connect a DeepSeek API key in settings
3. create or customize AI teammates with detailed behavior controls
4. start a coding workflow in a channel
5. see planning, implementation, review, and testing execute on one timeline
6. switch channel tabs without losing channel or workspace context
7. use core navigation pages as operational tools, not placeholder explanations

## Why This Phase Exists

The current product still carries a mismatch between customer-facing language
and internal runtime implementation:

- setup is still credential/provider-centric
- teammate creation still exposes backend-selection language
- several product surfaces still leak internal execution naming
- coding collaboration is present, but not yet packaged as a clean
  customer-ready DeepSeek-backed flow
- several high-frequency pages still explain future architecture instead of
  supporting immediate user action
- route/tab state and workspace state can disagree, which damages trust in data
  scope and tenant boundaries

This phase closes that gap.

## Commands

These are the commands the implementation phase is expected to use.

```bash
pnpm --filter web build
pnpm --filter api build
pnpm --filter worker build
pnpm --filter web test
pnpm --filter api test
pnpm --filter worker test
pnpm exec vitest run tests/integration/coding-workflow-api.spec.ts
pnpm exec vitest run tests/integration/coding-workflow-execution.spec.ts
pnpm exec vitest run tests/integration/phase-a-runtime-baseline.spec.ts
pnpm db:migrate
```

Additional acceptance commands expected for this phase:

```bash
pnpm exec vitest run tests/integration/deepseek-connection.spec.ts
pnpm exec vitest run tests/e2e/deepseek-settings.spec.tsx
pnpm exec vitest run tests/e2e/deepseek-coding-workflow.spec.tsx
```

## Project Structure

The likely implementation surface for this phase:

```text
apps/web/src/app/                          Top-level routes and page shells
apps/web/src/features/settings/            Settings UI and connection entry points
apps/web/src/features/setup/               Existing provider-centric setup to be replaced
apps/web/src/features/teammates/           AI teammate creation and management
apps/web/src/features/workmodes/           Coding-mode entry and recommended team flow
apps/web/src/features/workspaces/          Workspace switcher and workspace framing
apps/api/src/modules/credentials/          Existing credential APIs to evolve or wrap
apps/api/src/modules/coding-workflows/     Workflow creation, approval, dispatch
apps/api/src/modules/workspace-shell/      Surface data returned to customer UI
apps/worker/src/activities/                Hidden runtime selection and execution
packages/contracts/src/                    Public API schemas and UI-visible contracts
docs/product/                              Customer-facing vocabulary and product docs
docs/architecture/                         Runtime boundaries and hidden backend design
tests/integration/                         API and workflow integration coverage
tests/e2e/                                 Browser-backed DeepSeek readiness coverage
ai/specs ai/plans ai/tasks ai/logs         Living planning and execution records
```

## Code Style

This phase changes public contract language. Any new public type or API should
prefer customer-facing neutral naming and keep hidden execution details off the
wire.

```ts
type ModelConnection = {
  id: string;
  label: string;
  kind: "deepseek_api";
  status: "pending" | "valid" | "invalid";
  workspaceId: string;
};

type AiTeammateProfile = {
  id: string;
  name: string;
  summary: string;
  templateId: string | null;
  modelProfileId: string | null;
  memoryMode: "session" | "workspace" | "workspace_plus_teammate";
  approvalMode: "ask_on_risky" | "balanced" | "autonomous";
};
```

Do not expose:

- backend routing names
- provider compatibility labels
- raw internal runtime enums
- transport-specific error text unless rewritten into product language

## Testing Strategy

This phase needs four layers of verification:

1. **Contract tests**
   - new connection schemas
   - teammate-creation payload schemas
   - workflow-launch payload schemas

2. **Component tests**
   - teammate creation wizard
   - settings connection flow
   - workspace switcher overflow handling
   - work-mode launch states

3. **Integration tests**
   - DeepSeek connection create/validate/list/revoke
   - workflow launch with customized teammate sets
   - hidden runtime selection from a workspace DeepSeek connection

4. **Browser/E2E acceptance**
   - connect a DeepSeek key from settings
   - create a custom teammate
   - launch coding workflow
   - approve plan
   - watch implementation/review/tester timeline advance
   - switch channel tabs and preserve channel context
   - navigate settings sections and preserve active workspace context
   - verify inbox, task, calendar, and channel pages expose real action
     skeletons

## Boundaries

- Always:
  - keep customer-visible wording neutral and backend-agnostic
  - preserve the existing timeline-based collaboration model
  - verify every public contract change with tests
  - hide backend-routing decisions behind server-only mappings

- Ask first:
  - database schema migrations that delete or rename existing credential tables
  - adding a second public model vendor beyond DeepSeek
  - changing authentication/session behavior
  - changing the current coding-workflow approval semantics

- Never:
  - expose hidden backend origins in UI copy, labels, hints, or API responses
  - require customers to choose a runtime strategy by brand name
  - ship a DeepSeek setup flow without a real validation path
  - claim collaborative coding is ready without running a real-key acceptance path

## Product Decisions

### 1. Customer-Facing Naming Resets

All customer-facing product surfaces must use neutral nouns:

- `AI 同事`
- `模型连接`
- `工作区`
- `频道`
- `任务`
- `审批`

Explicitly remove customer-visible naming tied to legacy backend/provider
identity from:

- settings
- teammate creation
- work-mode entry
- channel status text
- error hints
- metadata
- product docs and demo instructions that users may read

### 2. Trust And Context Correctness Comes First

Before deeper product work, Phase E must fix the two trust-breaking state
issues identified in the page audit:

1. Channel tab changes must never lose the channel entity.
2. Settings, credentials, workspace pages, and channel pages must all read the
   same active workspace.

Implementation direction:

- establish one active workspace source for page loaders and client components
- treat fallback workspace IDs as initialization-only behavior
- make channel entity loading independent from the selected tab
- add tests for chat and file tabs using the same channel title, members, and
  workspace state
- add tests proving settings sections do not silently show a fallback workspace

This work is higher priority than UI polish because it protects user trust.

### 3. Workspace Shell Becomes A Compact Tool Shell

The logged-in workspace should not feel like a product explainer. Daily-use
pages need a compact shell:

- small top bar with page title and primary action
- compact left navigation with badges and tooltips instead of permanent
  subtitles
- no repeated hero copy on inbox, tasks, calendar, channel, and settings pages
- one settings entry point
- workspace switcher that truncates long names and never overflows
- important actions visually separated from explanatory text

`OnboardingShell` can keep richer introduction copy. `WorkspaceShell` should be
optimized for repeated use.

### 4. Workbench Becomes A Launcher, Not A Duplicate Channel

The workbench should focus on starting and resuming work:

- show current work mode and recommended teammates
- show recent channels and pending items
- provide a clear start or continue action
- move active chat back to the channel page
- hide unavailable future modes behind a lower-priority area
- make connection state actionable instead of showing vague persistent status

### 5. Core Pages Become Operational Tools

Inbox:

- type filters for mentions, approvals, task updates, calendar updates, run
  failures, and connection alerts
- queue/list area
- detail pane
- mark-read, resolve, snooze, open-source, and create-task actions
- empty states with immediate next steps

Tasks:

- create task
- search
- status, priority, owner, scope, and due-date filters
- list and board views with visible behavioral differences
- task detail and source links

Calendar:

- real month, week, and day grids
- today, previous, and next navigation
- event creation
- user and AI teammate calendar toggles
- create event from task, channel message, or approved plan

Channels:

- searchable channel overview
- create channel
- active, archived, participated, and failure filters
- sort by recent activity, creation time, unread count, and teammate count
- shortcut actions for chat, files, copy link, and member management
- channel chat and files tabs sharing the same loaded entity

Settings:

- group settings into account, workspace, and AI platform areas
- reduce explanatory copy
- keep configuration status and next actions visible

Members:

- human and AI members share one directory model
- support roles, status, invite state, last active time, disable, and ownership
  transfer planning

Billing:

- provide a usable skeleton for current plan, usage, quota, cost breakdown,
  invoices, payment method, and upgrade action
- clarify the difference between user-provided model keys and platform-managed
  usage when that mode becomes available

Capability management:

- move from category explanation to installable/enabled capability objects
- expose source, version, permission scope, compatible teammate roles, enabled
  status, and risk notes

### 6. Teammate Creation Becomes Deeply Configurable

The teammate creation flow must support both templates and a fully custom path.

The template catalog must include:

- recommended role templates used by coding mode
- at least one `自定义` entry that starts from a blank but valid teammate profile

The current `运行策略` step must be removed.

In its place, teammate configuration should expose customer-meaningful
dimensions modeled after the reference agent setup flow:

1. `模板`
2. `身份`
3. `职责与边界`
4. `工具与权限`
5. `记忆与上下文`
6. `审批与自动化`
7. `模型偏好`
8. `输出风格`
9. `确认`

These steps should allow rich customization without revealing hidden backend
origins.

The creation UX should be split:

- simple creation for most users: template, name, role, channels, create
- advanced settings for administrators: tools, memory, approvals, model
  preference, and output style

Template selection must immediately prefill visible fields. Disabled buttons
must explain the missing requirement in user language.

### 7. Settings Shift From Provider Credentials To Model Connections

The current credential flow is too provider-centric. This phase introduces a
workspace-scoped `模型连接` story.

For this slice:

- only `DeepSeek` is offered in the customer UI
- the default base URL is the official DeepSeek endpoint
- model selection should default to the newest generally available DeepSeek
  coding-friendly pair
- advanced fields can exist, but the primary path must remain short and
  predictable

The settings experience should support:

- add connection
- validate connection
- set workspace default
- optionally override model preferences for specific teammates
- revoke connection

The UI must also model disabled reasons for validation and saving:

- missing label
- missing key
- not validated
- workspace mismatch
- insufficient permission
- network or service failure

### 8. Channel Timeline Gets Real Recovery Actions

Run failures should stay visible, but they need actionable recovery:

- retry
- view technical details for authorized users
- open model connection settings
- create recovery task
- switch to an available fallback only through product-safe language

The message timeline should reduce per-message visual noise. Pinning and other
secondary actions should be available without overpowering normal reading.

The composer should make selected teammates, availability, and send target
clear before dispatch.

### 9. Hidden Runtime Mapping

Customer-facing teammate profiles must be separated from hidden execution
backend routing.

The customer picks:

- what the teammate does
- what tools it may use
- how much autonomy it has
- which model profile it prefers

The platform decides internally:

- which hidden backend implementation executes that teammate
- how DeepSeek requests are translated
- whether a fallback path exists
- how memory and context are hydrated

None of those hidden decisions should be serialized into public labels.

### 10. Real Collaborative Coding Must Be Proven With DeepSeek

This phase is not complete if the system only saves a key and renders forms.

Acceptance requires:

1. a workspace can save a valid DeepSeek connection
2. coding mode can launch using that connection
3. plan approval still gates execution
4. implementation, review, and testing messages stream into the timeline
5. failure states are readable and stay in product language

## DeepSeek Readiness Constraints

This phase is grounded in current official DeepSeek documentation available on
`2026-05-30`.

- The official API base is `https://api.deepseek.com`
- DeepSeek also documents an Anthropic-compatible endpoint under
  `https://api.deepseek.com/anthropic`
- The current model line includes `DeepSeek-V4-Pro` and `DeepSeek-V4-Flash`
  with update notes published on `2026-04-24`
- The older `deepseek-chat` and `deepseek-reasoner` aliases have deprecation
  guidance published for `2026-07-24`

For this phase, the customer UI should bias toward the current V4 line and
avoid building new product language around legacy model names.

## Non-Goals

This phase does not include:

- a second public model vendor
- exposing backend strategy choice in teammate creation
- a generic marketplace for arbitrary third-party agent engines
- a full billing implementation
- a rewrite of the existing workflow engine
- claiming a second internal coding backend is live before its source is
  actually present locally
- full billing and payment processing
- full marketplace package installation beyond a credible management skeleton
- a complete enterprise member-permission system beyond the fields needed for
  truthful UI and future implementation

## Success Criteria

This phase is complete when:

1. Customer-visible product surfaces no longer expose backend/provider brand
   names.
2. Teammate creation includes a real `自定义` template and no longer shows a
   `运行策略` step.
3. Teammate configuration supports detailed customization across tools, memory,
   approvals, model preference, and output style.
4. Settings expose a usable `DeepSeek` connection flow with validation and a
   workspace default.
5. The workspace switcher no longer visually overflows its card or pill
   container in narrow sidebars.
6. Coding collaboration can execute against a real DeepSeek key and preserve the
   existing approval-first workflow.
7. Tests and real acceptance evidence exist for both the connection flow and the
   coding workflow.
8. Channel chat and files tabs preserve the same channel and workspace context.
9. Settings sections do not show a fallback workspace when an active workspace
   exists.
10. Inbox, tasks, calendar, channel overview, settings, members, billing, and
    capability management each expose a credible operation skeleton with
    meaningful empty states.
11. Channel run failures include recovery actions.
12. The workbench no longer duplicates full channel chat; it starts or resumes
    work.

## Open Questions

1. Should teammate-level model preference allow choosing between `高性能` and
   `快速` presets only, or expose explicit model IDs in advanced settings?
2. Should every teammate be allowed its own connection override, or should Phase
   E only support workspace-default DeepSeek plus optional teammate model
   profile?
3. When the missing second internal coding backend becomes available, should it
   be routed only as a hidden planner path, or as a full alternate execution
   engine?
