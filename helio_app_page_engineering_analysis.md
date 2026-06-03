# Helio Desktop App Page Engineering Analysis

## 1. Scope

This document records a page-by-page engineering analysis of the Helio desktop app that was open locally on 2026-05-29.

Observed runtime context:

- App name: `Helio`
- Version: `0.3.14`
- Desktop shell: macOS app bundle `/Applications/Helio.app`
- Current workspace: `Ricardo's Organization`
- UI language: Chinese
- User timezone shown in app: `Australia/Sydney (UTC+10:00)`
- Billing state shown in app: free trial with `$3.92` remaining

Method used:

- Switched pages directly inside the running app via Computer Use.
- Recorded visible routes from the app URL hash, page controls, and empty states.
- Inspected the packaged Electron bundle to understand how the pages are likely implemented.
- Cross-checked route-level chunk names inside `app.asar` to map visible pages to renderer modules.

Important boundary:

- Pages below are split into `directly visited` and `bundle-inferred`.
- I directly navigated all visible top-level and secondary pages that were safely accessible in the current workspace state.
- I did not trigger destructive actions such as deleting assistants, submitting purchases, or sending invitations.
- A few internal pages exist in the bundle but were not surfaced by the current workspace state, so those are marked as inferred only.

## 2. Executive Summary

Helio is a packaged Electron desktop application that serves a local renderer at the synthetic origin `https://app.helio.im/`, then uses hash routing such as `#/inbox`, `#/tasks`, `#/calendar`, `#/channel/:id`, `#/dms/:id`, `#/assistants/new`, and `#/settings`.

At the product level, the app is a hybrid of:

- team chat
- AI teammate orchestration
- task tracking
- calendar coordination
- workspace file browsing
- skill and memory management for assistants
- workspace administration and billing

At the engineering level, the product is structured like a persistent app shell plus route-scoped content panes:

- a left sidebar for workspace, navigation, channels, assistants, and DMs
- a top utility strip for navigation, notifications, billing status, and app-wide controls
- a main content region driven by hash routes and query-string sub-sections

The app strongly suggests a reusable component architecture:

- global tasks and assistant tasks use the same task view with different scope
- global calendar and assistant calendar use the same calendar container with different owner context
- settings pages use a common section host with different section payloads
- chat, file, skill, memory, and settings tabs reuse a standard DM route shell

## 3. Architecture Evidence

The following points are grounded in the installed bundle, not just UI guesswork.

### 3.1 Desktop shell

The app bundle metadata shows:

- `CFBundleIdentifier = app.helio.desktop`
- `CFBundleShortVersionString = 0.3.14`
- `ElectronAsarIntegrity` is present in `Info.plist`
- Electron helper apps and frameworks are bundled under `Contents/Frameworks`

That makes the desktop shell definitively Electron-based.

### 3.2 Packaged renderer serving model

The Electron main process registers a custom protocol handler for `https` and intercepts requests to `app.helio.im`, mapping them to local files inside `out/renderer`.

What that means in practice:

- packaged mode still shows a browser-like URL such as `https://app.helio.im/#/settings`
- but the renderer is served from local app assets
- external hosts are allowed to pass through normally
- this gives the UX of a web app origin while retaining a local desktop package

This is an elegant pattern because it keeps:

- same-origin browser semantics
- simpler CSP handling
- a path to reuse a web codebase
- cleaner separation between local app shell and remote API hosts

### 3.3 Frontend stack

The packaged `package.json` says:

- app name: `helio-desktop`
- description: `Helio Desktop (Electron) · built on @helio-ui + helio-sdk`

The renderer `index.html` contains explicit comments about:

- React mounting
- no-flash theme initialization
- no-flash language initialization
- preconnect to `https://api.helio.im`
- preconnect to `https://clerk.helio.im`
- boot splash behavior before React hydrates

The hashed asset names and route chunks strongly suggest a Vite-style build pipeline.

So the high-confidence frontend stack is:

- Electron main process
- React renderer
- Vite-style asset bundling and code splitting
- internal UI package `@helio-ui`
- internal SDK package `helio-sdk`

### 3.4 Auth, realtime, and platform bridge

From the bundle:

- backend API endpoint: `https://api.helio.im`
- websocket endpoint: `wss://ws.helio.im`
- auth/web origin: `https://app.helio.im`
- Clerk auth domain: `clerk.helio.im`

The preload script exposes `window.helio` capabilities for:

- auth login browser flow
- ChatGPT subscription OAuth
- billing checkout/return
- notifications
- file save
- clipboard image write
- auto-updater
- window controls
- last-seen cursors

This implies the renderer is a mostly web-style SPA, with desktop capabilities injected through a controlled Electron preload bridge instead of direct Node access in the renderer.

### 3.5 Route-level code splitting

Renderer chunk names directly map to product surfaces:

- `InboxRoute`
- `TasksRoute`
- `CalendarRoute`
- `ChannelRoute`
- `DMRoute`
- `CreateAssistantRoute`
- `TaskView`
- `CalendarContainer`
- `SettingsSection`
- `AddCredentialDialog`
- `AssistantDeleteDialog`
- `SessionRoute`
- `ActivationView`

That naming is extremely useful because it shows the product is implemented as route modules and shared feature modules rather than a single monolithic renderer.

## 4. Directly Visited Route Inventory

| Route or surface | Directly visited | Notes |
| --- | --- | --- |
| `#/inbox` | Yes | Inbox with category filters and empty state |
| `#/tasks` | Yes | Global tasks page, list and board views |
| `#/calendar` | Yes | Global calendar, month/week/day views |
| `#/channel/6a17f215e568ed6315c9960c` | Yes | Channel chat page for `#ship` |
| `#/channel/6a17f215e568ed6315c9960c?tab=workspace` | Yes | Channel files/workspace tab |
| `#/dms/6a17f2039ba36601174759b6` | Yes | Software Engineer assistant DM shell |
| `#/dms/6a17f2039ba36601174759b6?tab=tasks` | Yes | Assistant-scoped tasks |
| `#/dms/6a17f2039ba36601174759b6?tab=activity` | Yes | Assistant activity feed |
| `#/dms/6a17f2039ba36601174759b6?tab=calendar` | Yes | Assistant calendar |
| `#/dms/6a17f2039ba36601174759b6?tab=channels` | Yes | Assistant channel subscriptions |
| `#/dms/6a17f2039ba36601174759b6?tab=workspace` | Yes | Assistant files/workspace tab |
| `#/dms/6a17f2039ba36601174759b6?tab=skills` | Yes | Assistant skill management |
| `#/dms/6a17f2039ba36601174759b6?tab=memory` | Yes | Assistant memory browser |
| `#/dms/6a17f2039ba36601174759b6?tab=settings` | Yes | Assistant identity and role settings |
| `#/dms/6a17f2039ba36601174759b5` | Yes | Tech Lead DM shell |
| `#/dms/6a17f2039ba36601174759b5?tab=settings` | Yes | Tech Lead role card |
| `#/dms/6a17f2039ba36601174759b7` | Yes | Code Reviewer DM shell |
| `#/dms/6a17f2039ba36601174759b7?tab=settings` | Yes | Code Reviewer role card |
| `#/dms/6a17f2039ba36601174759b4` | Yes | QA Tester DM shell |
| `#/dms/6a17f2039ba36601174759b4?tab=settings` | Yes | QA Tester role card |
| `#/assistants/new` | Yes | Create assistant wizard |
| `#/settings` | Yes | Global settings host, profile section |
| `#/settings?section=updates` | Yes | App updates |
| `#/settings?section=general` | Yes | Workspace general settings |
| `#/settings?section=members` | Yes | Member management |
| `#/settings?section=api-credentials` | Yes | API credentials |
| `#/settings?section=billing` | Yes | Billing and plans |
| `#/settings?section=marketplaces` | Yes | Marketplace sources |
| `新建私信` modal | Yes | Search and pick a DM target |
| `添加凭据` modal | Yes | Credential provider/key form |
| `工作区` popover | Yes | Workspace switch/settings/create |
| `账户菜单` popover | Yes | Theme, language, tutorial, settings, billing, account |

## 5. Bundle-Inferred But Not Safely Entered

These were visible from bundle chunk names but were not opened in the current session:

- `ActivationView`
- `SessionRoute`
- `AssistantDeleteDialog`
- `OnboardingRedirector`

Why not entered:

- they were not exposed by the current logged-in workspace state
- or entering them would require destructive actions or auth-state mutation

## 6. Persistent App Shell

Before describing individual pages, it is important to note that Helio has a stable shell that almost never changes.

Observed shell regions:

- top utility bar with sidebar toggle, browser-like back/forward, trial balance, and upgrade CTA
- left navigation sidebar with workspace switcher, Inbox, Tasks, Calendar, Channels, AI teammates, DMs, account menu, and AI presence indicator
- main content pane controlled by route and tab state

Engineering reading:

- this is almost certainly a single root shell component that owns layout, sidebar state, account state, and route outlet rendering
- the route content is mounted inside the main pane, which explains why the sidebar and top bar persist across `#/inbox`, `#/tasks`, `#/settings`, and `#/dms/*`
- the shell probably consumes global workspace and session stores, while page modules subscribe only to scoped data

Likely implementation pattern:

- React Router with hash routing
- route outlet inside a root layout component
- persistent workspace/session store via SDK client plus local cache
- websocket-driven invalidation for tasks, activity, presence, and messaging

## 7. Page-by-Page Analysis

### 7.1 Inbox

Route:

- `#/inbox`

Observed purpose:

- centralized triage surface for items needing attention
- seems to unify mentions, approvals, task updates, and calendar changes

Observed UI:

- title `收件箱`
- disabled `全部标为已读`
- filter popover
- category switcher: `全部 / 任务 / 日历 / 审批`
- split layout with list pane on the left and detail pane on the right
- current workspace is empty, so the page shows an empty-state explanation

Likely implementation:

- a mailbox-style indexed feed, not a raw message list
- each row likely points to a typed entity reference such as task update, calendar event, approval item, or mention
- right-side detail pane probably reuses the native page component for the selected item, or an embedded summary component
- the page likely supports unread state, cursor pagination, and category-based server filtering

Likely data model:

- `InboxItem { id, kind, actor, targetType, targetId, status, createdAt, readAt }`
- `kind` probably includes task, calendar, approval, mention, maybe assistant-alert

Why this page matters architecturally:

- it acts as a cross-domain aggregation layer above tasks, chat, and calendar
- that usually means a dedicated backend feed service or a denormalized notification index

### 7.2 Global Tasks

Route:

- `#/tasks`

Observed purpose:

- workspace-wide task tracking

Observed UI:

- view switch: `列表 / 看板`
- grouping dropdown, currently `按状态`
- closed-task visibility window, currently `1 周`
- create button
- search box
- filters: `状态 / 优先级 / 负责人`
- empty-state message

Engineering reading:

- this looks like a generic task browser with scope injection
- the existence of both global tasks and assistant tasks with nearly identical UI strongly suggests a shared `TaskView` component
- only the query scope changes: workspace scope vs assistant scope

Likely implementation:

- a normalized task table or cache keyed by workspace and scope
- filter state held in URL query params or route-local store
- list mode and board mode probably share one query layer and diverge only in presentation
- board mode likely groups tasks client-side by a field like status, unless the backend returns pre-grouped lanes

Likely backend contract:

- list tasks by scope, status, assignee, priority, closed-window, and search
- create task
- update task status and metadata

### 7.3 Global Calendar

Route:

- `#/calendar`

Observed purpose:

- workspace or personal scheduling surface

Observed UI:

- `今天`, previous, next navigation
- header showing a time period such as `May 24 – 30, 2026`
- owner label `My calendar`
- view tabs `月 / 周 / 日`
- `+ 事件` creation button
- calendar grid with GMT offset and time columns
- a current-time indicator line in week/day views

Engineering reading:

- this page is a reusable calendar container with owner context
- the exact same calendar structure appears again inside assistant pages
- the shared chunk name `CalendarContainer` supports that interpretation

Likely implementation:

- a single calendar engine component parameterized by owner or scope
- month/week/day are either internal tabs or query-state views in one page component
- event creation likely opens a modal bound to the selected date/time cell
- the red current-time line indicates continuous time-based rendering, likely a timer tick in the client

Likely integration direction:

- internal events today
- external calendar sync later or already planned, because profile settings show future calendar OAuth support

### 7.4 Channel Page: `#ship`

Routes:

- `#/channel/6a17f215e568ed6315c9960c`
- `#/channel/6a17f215e568ed6315c9960c?tab=workspace`

Observed purpose:

- standard persistent team channel with chat and file/workspace tabs

Observed UI in chat tab:

- channel title `ship`
- member count toggle
- notification button
- pin toggle
- channel actions menu
- tabs `聊天 / 文件`
- welcome card with `邀请队友` and `添加描述`
- message timeline showing channel creation and assistant invitations
- bottom composer with attachment, formatting, emoji, mention, and send affordances

Observed UI in files/workspace tab:

- file panel labeled `频道共享文件`
- refresh button
- currently visible row `.helio`

Engineering reading:

- the chat tab is a conventional channel timeline
- the file tab is not just “uploaded attachments”; it looks more like a workspace file tree or repository root view
- the `.helio` root is a strong hint that this page exposes a scoped filesystem/project workspace, probably for assistants to operate against

Likely implementation:

- channel messages arrive via websocket and append into a virtualized timeline
- system events such as “created channel” and “invited assistant” are specialized timeline items
- the composer likely supports markdown or rich-text formatting because there is a format toolbar toggle
- the files tab probably mounts a directory tree backed either by local workspace sync, server-hosted workspace metadata, or a hybrid desktop bridge

Notable product implication:

- Helio is not just chat around work; it wants assistants to operate in the context of files, channels, and execution environments

### 7.5 Assistant DM Shell

Representative routes:

- `#/dms/6a17f2039ba36601174759b6`
- `#/dms/6a17f2039ba36601174759b5`
- `#/dms/6a17f2039ba36601174759b7`
- `#/dms/6a17f2039ba36601174759b4`

Observed purpose:

- each AI teammate is modeled as a first-class member with its own DM surface and operational tabs

Common shell structure:

- assistant title and avatar
- tabs: `聊天 / 任务 / 活动 / 日历 / 频道 / 文件 / 技能 / 记忆 / 设置`
- main pane swaps based on selected tab

This is one of the most important design decisions in the whole app.

Why:

- the AI teammate is not implemented as a simple chat bot
- it is implemented as an actor with tasks, activity log, calendar context, subscriptions, workspace files, skills, memories, and settings
- this makes the assistant closer to a scoped software agent or digital teammate than a one-shot LLM chat

#### 7.5.1 Role cards directly observed

| Assistant | Role description observed in settings |
| --- | --- |
| Software Engineer | implementation teammate for scoped code changes, debugging, tests, build failures, and architecture-aware implementation |
| Tech Lead | coordination teammate for ambiguous engineering requests, decomposition, sequencing, delegation, review, QA coordination, and final synthesis |
| Code Reviewer | independent review teammate for diffs, PRs, migration review, regression risk, and missing-test critique |
| QA Tester | verification teammate for reproductions, acceptance checks, manual QA, E2E verification, regression testing, screenshots, logs, and edge cases |

This is a very intentional multi-agent operating model.

The product is essentially encoding team topology into assistant identity.

#### 7.5.2 Chat tab

Observed UI:

- standard composer
- placeholder text changes by assistant, for example `Ask Software Engineer anything`

Likely implementation:

- same chat primitive as channel chat, but scoped to assistant DM
- conversation history likely doubles as context window source for the assistant
- composer submission probably creates both a user message and an agent execution job

#### 7.5.3 Tasks tab

Observed UI:

- same list/board task view as the global tasks page
- same filters and create flow

Engineering reading:

- almost certainly the same `TaskView` module reused with `scope = assistantId`

Product implication:

- assistants can own or at least be associated with task objects

#### 7.5.4 Activity tab

Observed UI:

- searchable activity feed
- channel filter dropdown
- sort direction control
- one visible round showing the assistant “thinking” and a text result

Observed sample content:

- one round exists for Software Engineer
- it records execution state and textual output

Engineering reading:

- this looks like an execution trace surface
- `回合` suggests a round/turn concept rather than ordinary chat message history
- activity is likely persisted as agent runs, tool calls, or workflow steps separate from chat messages

Likely implementation:

- append-only execution log
- each run has status such as thinking, latest, completed, failed
- may store prompt trigger, intermediate tool usage, and summarized output

#### 7.5.5 Calendar tab

Observed UI:

- same month/week/day calendar structure as global calendar
- owner label changes to the assistant name

Engineering reading:

- shared calendar container, scoped by actor
- likely used for assistant reminders, meetings, or scheduled work

#### 7.5.6 Channels tab

Observed UI:

- search bar for assistant channels
- category switches `全部 / 私信 / 群组`
- empty state saying the assistant has no AI-only channels yet

Engineering reading:

- assistants can subscribe to channels independently of the human user
- there is likely a permission/subscription table linking assistant IDs to channel IDs

#### 7.5.7 Files tab

Observed UI:

- channel/shared file surface
- root row `.helio`

Engineering reading:

- same or similar file explorer used on channel pages
- likely a shared workspace mount visible from both channel and assistant contexts
- code-viewer and syntax-highlighting bundles in the app support the idea that this surface can render source files richly

#### 7.5.8 Skills tab

Observed UI:

- segmented controls `已安装 / 浏览 / 手动添加`
- search field
- installed built-in skills list

Visible installed skills:

- `heliox`
- `productivity`
- `document-skills`
- `engineering`

Engineering reading:

- skills are first-class runtime capabilities attached to assistants
- not just prompt presets; likely packageable modules or plugin descriptors
- marketplace and skill management pages support this architecture

#### 7.5.9 Memory tab

Observed UI:

- search field
- list/detail split layout
- instruction to pick a memory on the left to see details
- currently mostly empty or loading

Engineering reading:

- assistant memory is treated as structured, browseable data rather than hidden context only
- likely stored as indexed memory records with summary, source, timestamp, and assistant linkage
- split-pane layout suggests memories can be individually inspected, edited, or deleted

#### 7.5.10 Settings tab

Observed UI:

- identity card
- display name
- locked model field
- long-form role description
- subscribed channels section
- dangerous delete area

Engineering reading:

- assistants are persistent workspace entities with editable identity and role scope
- model selection appears locked after creation, meaning assistants may be immutable in provider/model identity once instantiated
- subscribed channels and skills together imply assistant runtime behavior is configurable along multiple axes

### 7.6 Create Assistant Wizard

Route:

- `#/assistants/new`

Observed purpose:

- create a new AI teammate from template or from scratch

Observed UI:

- multi-step wizard
- visible progress items include template selection, provider, profile, and joining channels/workspace
- provider shown in the current state: `Helio · DeepSeek V4 Pro`
- categories include `Recommended`, `Engineering`, `Data`, `GTM`, `Product`, `Academic Research`, `Industrial Research`, `Finance`, `Legal`, `People`, and `Utility`
- templates include both Chinese and English role definitions

Observed template examples:

- 邮件助手
- 会议纪要
- 周报助手
- 技术负责人
- 工程师
- 代码评审
- 测试
- 数据分析师
- Data Scientist
- Academic Researcher
- Research Engineer
- 会计
- 法务

Engineering reading:

- templates are data-driven role manifests, not hard-coded page-specific logic
- each template appears to carry role description plus skill tags
- provider selection is part of assistant provisioning, which suggests assistants are bound to a model backend at creation time

Likely implementation:

- step-based form state machine
- template catalog loaded from marketplace or bundled source
- assistant creation request assembles model/provider, identity, role prompt, skills, and channel subscriptions

This wizard is a core product differentiator because it turns assistant creation into structured team design, not just “start a new chat”.

### 7.7 Global Settings Host

Route family:

- `#/settings`
- `#/settings?section=*`

Observed structure:

- left sub-navigation
- right detail pane
- persistent return-to-app button

This is a classic account/workspace admin surface.

#### 7.7.1 Personal Profile

Route:

- `#/settings`

Observed UI:

- identity card with avatar, display name, handle, timezone, email, ID
- editable display name, handle, timezone, bio
- future connected-account integrations shown as disabled: Google, GitHub, Calendar

Engineering reading:

- user profile is workspace-scoped at least for handle
- the future integration placeholders reveal a roadmap toward external account syncing
- timezone is a core field because scheduling and teammate coordination are central product concepts

#### 7.7.2 Updates

Route:

- `#/settings?section=updates`

Observed UI:

- current version `Helio 0.3.14`
- `检查更新`
- prerelease toggle

Engineering reading:

- connected to Electron auto-updater
- preload exposes updater channels, so this page is likely a thin control surface over main-process update state

#### 7.7.3 Workspace General

Route:

- `#/settings?section=general`

Observed UI:

- workspace avatar
- workspace name
- slug
- description
- workspace ID

Engineering reading:

- workspace has both human-readable name and URL slug
- the route structure and copy imply a multi-workspace system similar to Slack/Linear/Notion organizations

#### 7.7.4 Members

Route:

- `#/settings?section=members`

Observed UI:

- invitation box by email and role
- current member list
- one human admin plus four AI teammates as members

This is a major design signal.

Why:

- assistants are not hidden system resources
- they appear in the same membership model as humans
- role and permission systems likely treat them as workspace principals

Likely implementation:

- membership table with principal type `human` or `assistant`
- invite flow likely uses Clerk for human onboarding

#### 7.7.5 API Credentials

Route:

- `#/settings?section=api-credentials`

Observed UI:

- empty-state explanation
- CTA to add provider key so assistants can run LLM calls on the user's own account

Observed add-credential modal:

- provider selector, currently default `Anthropic`
- label field
- secret value field
- expiry date, disabled when `永不过期` is checked
- submission note that the key is encrypted and not shown again after save

Engineering reading:

- this is bring-your-own-key support
- secrets are likely encrypted server-side or with workspace-scoped secret storage
- label support implies multiple keys per provider and environment-like management

#### 7.7.6 Billing

Route:

- `#/settings?section=billing`

Observed UI:

- current plan `免费`
- remaining free balance `$3.92`
- plan cards: `Basic $20`, `Pro $100`, `Max $200`, `Ultra $1000`
- daily usage chart showing cost and tokens

Engineering reading:

- the billing model is usage-sensitive, not just seat-based
- cost and token tracking is a first-class dimension of the product
- billing and model/provider choices are tightly linked to assistant execution economics

#### 7.7.7 Marketplace

Route:

- `#/settings?section=marketplaces`

Observed UI:

- marketplace source list
- CTA to add a marketplace source
- built-in sources currently shown: `anthropic-agent-skills`, `heliohq`, `knowledge-work-plugins`

Engineering reading:

- Helio is built to consume externally defined skills/plugins/market sources
- the product architecture is extensible and package-oriented
- assistant capability distribution is probably not hard-coded into the app binary alone

### 7.8 Global Popovers and Modals

#### 7.8.1 New DM Modal

Observed UI:

- search field
- list of human and assistant recipients
- starts a private conversation from a picker modal

Implementation reading:

- the modal likely creates or resolves a DM thread keyed by participant principal IDs
- since assistant DMs already exist, this picker is probably a lookup or lazy-create flow

#### 7.8.2 Workspace Popover

Observed UI:

- current workspace
- workspace settings
- create workspace

Implementation reading:

- workspace switching is global app state
- renderer boot splash comments mention a special workspace-switch path, reinforcing that switching causes a substantial tree reset

#### 7.8.3 Account Menu

Observed UI:

- theme: light, system, dark
- language: Chinese, English
- tutorial
- settings
- billing
- switch account
- log out

Implementation reading:

- theme and language are backed by localStorage and initialized before React mount
- account/session actions likely bridge to Clerk-auth state plus desktop shell reset

## 8. Page Families and Reuse Patterns

From the UI and bundle together, the reuse patterns are quite clear.

### 8.1 Tasks are one system with different scopes

Evidence:

- global tasks and assistant tasks have the same controls and layout
- bundle contains shared chunk `TaskView`

Likely pattern:

- one task view component
- different query scope injected from route context

### 8.2 Calendar is one system with different owners

Evidence:

- global calendar and assistant calendar have the same structure
- bundle contains shared chunk `CalendarContainer`

Likely pattern:

- one calendar engine
- owner can be user, workspace, or assistant

### 8.3 Settings are section-driven

Evidence:

- settings route varies only by `?section=...`
- bundle contains `SettingsSection`

Likely pattern:

- one settings host page
- section registry drives which detail component renders

### 8.4 Assistant pages are actor shells

Evidence:

- every assistant DM has the same tab suite
- only assistant identity and underlying data differ

Likely pattern:

- a generic actor route shell
- actor metadata injected at top
- tabs mapped to independent feature modules

## 9. Likely Data Model

A plausible domain model consistent with the UI would be:

- `Workspace`
- `Member`
- `Assistant`
- `Channel`
- `DMThread`
- `Message`
- `Task`
- `CalendarEvent`
- `InboxItem`
- `ActivityRound`
- `Skill`
- `MemoryRecord`
- `Credential`
- `MarketplaceSource`
- `SubscriptionPlan`
- `UsagePoint`

Key relationships likely include:

- a workspace has human members and assistant members
- assistants subscribe to channels
- assistants own skills and memory records
- tasks can be scoped to workspace, channel, or assistant
- calendar views are owner-scoped
- billing belongs to workspace or account, but usage is attributable to assistant/model execution

## 10. Likely Runtime Architecture

If I were explaining how this app is probably built from an engineering standpoint, I would describe it like this.

### 10.1 Renderer

- React SPA
- hash-router driven routes
- code-split route bundles
- persistent app shell with route outlet
- local storage for theme and language bootstrap

### 10.2 Main process

- BrowserWindow lifecycle
- custom `https://app.helio.im` protocol mapped to packaged renderer files
- auto-update management
- notification plumbing
- OAuth/auth callback handling
- controlled external-link opening
- CSP injection

### 10.3 Backend communication

- REST-like API at `api.helio.im`
- websocket or realtime channel at `ws.helio.im`
- auth via Clerk
- likely cached client SDK through `helio-sdk`

### 10.4 Desktop bridge

Exposed through preload:

- billing
- auth
- notifications
- last-seen cursor persistence
- file save
- clipboard
- updater
- window controls

This is a strong separation model because it keeps renderer code closer to a normal web app while still exposing desktop-only features safely.

### 10.5 Observability and reliability

The bundle includes:

- Sentry for Electron
- offline-aware Sentry filtering
- update controls
- window state persistence
- careful boot splash handling

That suggests the team is already thinking about:

- startup polish
- renderer failure modes
- crash capture
- production debugging

## 11. Product and Engineering Takeaways

The most important conclusions are:

- Helio is not “chat plus an LLM”; it is a workspace-centric multi-agent operating system.
- AI assistants are first-class workspace members, not hidden implementation details.
- Tasks, calendars, activity logs, files, memories, skills, and billing are all attached to those assistants in structured ways.
- The app reuses a small number of strong primitives across scopes: task view, calendar view, settings host, actor shell, file surface.
- The Electron wrapper is relatively thin. Most product complexity lives in the renderer, shared SDK, and backend services.

## 12. What I Could Not Fully Verify

These items were visible or strongly implied, but not fully exercised:

- actual message sending flow
- task creation and mutation
- event creation form
- invite submission flow
- purchase/checkout flow
- notification drawer contents
- assistant deletion dialog
- onboarding/session/activation routes

I intentionally avoided actions that would mutate workspace state, spend money, or remove data.

## 13. Final Assessment

From a software engineering perspective, Helio appears to be a well-structured Electron + React application with a clear route/module architecture and a product model centered on persistent AI coworkers.

The strongest architectural choices visible from this session are:

- local packaged renderer served through a stable app origin
- first-class assistant entity model
- reusable page families across scopes
- carefully designed desktop bridge instead of direct renderer privileges
- explicit extensibility through skills, marketplace sources, and external credentials

If I were onboarding a new engineer to this codebase, I would start them with these conceptual modules:

- app shell and routing
- workspace/member/assistant domain model
- task and calendar shared components
- assistant DM shell and tab registry
- preload bridge and Electron main process
- skill/memory/marketplace subsystem
- billing and credential management

That map matches both what the UI shows and what the packaged bundle reveals.
