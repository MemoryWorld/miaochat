# Spec Snapshot: Phase D Workspace Actor Platform

## Status

Drafted on `2026-05-29` after reviewing:

- the local desktop reference app page analysis document
- the local CLI source snapshot used for defensive architecture study
- the current `Phase C` runtime and product shell
- the enhanced Hermes runtime documentation and Honcho integration notes

This spec replaces the `Phase C` coding-workflow-only snapshot as the active
product direction.

## Non-Negotiable Constraints

1. The customer-facing product remains Chinese-first only in this phase.
2. The product must not surface raw provider brands in the normal customer
   journey.
3. The external reference brand must not appear in code, product copy, route
   names, or generated planning artifacts.
4. The local analysis document and the local CLI source snapshot remain local
   research inputs only. They are not distribution assets.
5. The current architectural substrate remains:

   `web -> api -> worker -> internal runtime`

6. The current `Phase C` coding workflow is kept, but it becomes one workflow
   inside a larger workspace operating model.

## Objective

Transform `Miaochat` from a coding-workflow-centric product into a
workspace-centric AI teammate platform with a persistent shell, first-class AI
members, shared task and calendar primitives, structured approvals, workspace
files, skills, memory, and actor-scoped execution surfaces.

The target experience is:

> 用户进入工作区 -> 看到稳定的工作台壳层 -> 在收件箱 / 任务 / 日历 /
> 频道 / AI 同事之间切换 -> 打开某位 AI 同事的专属页面 ->
> 在同一套壳层里查看聊天、任务、活动、日历、频道、文件、技能、记忆、设置 ->
> 发起编码工作流 -> 技术负责人先出计划 -> 用户审批 ->
> 工程 / 评审 / 测试结果与活动痕迹都回写到同一工作区。

## Product Shell

### 1. Stable Workspace Shell

The app shell becomes the primary product primitive.

It must include:

- workspace switcher
- inbox entry
- tasks entry
- calendar entry
- channels section
- AI teammate section
- direct messages section
- account and settings entry
- persistent top utility bar

The shell persists while route content changes.

### 2. Route Families

The first full route family set is:

- `/inbox`
- `/tasks`
- `/calendar`
- `/channels/:channelId`
- `/channels/:channelId?tab=files`
- `/teammates/:teammateId`
- `/teammates/:teammateId?tab=tasks`
- `/teammates/:teammateId?tab=activity`
- `/teammates/:teammateId?tab=calendar`
- `/teammates/:teammateId?tab=channels`
- `/teammates/:teammateId?tab=files`
- `/teammates/:teammateId?tab=skills`
- `/teammates/:teammateId?tab=memory`
- `/teammates/:teammateId?tab=settings`
- `/teammates/new`
- `/settings?section=profile`
- `/settings?section=workspace`
- `/settings?section=members`
- `/settings?section=credentials`
- `/settings?section=billing`
- `/settings?section=marketplaces`

The exact URL format may use Next.js segment routes instead of hash routing,
but the information architecture must match this family model.

### 3. Shared Page Primitives

The shell should be built from reusable page primitives rather than
route-specific implementations:

- `InboxView`
- `TaskView`
- `CalendarView`
- `ChannelShell`
- `ActorShell`
- `FilesSurface`
- `SettingsHost`
- `ApprovalCard`
- `ActivityTimeline`

This mirrors the strongest pattern in the reference analysis: one page family,
many scopes.

## Product Entities

The product must treat the following as first-class objects:

- `Workspace`
- `Member`
- `AI Teammate`
- `Channel`
- `Direct Thread`
- `Message`
- `Task`
- `Calendar Event`
- `Inbox Item`
- `Activity Round`
- `File Surface Entry`
- `Skill Binding`
- `Memory Record`
- `Approval Request`
- `Credential`
- `Marketplace Source`
- `Usage Meter`

## AI Teammates

### 1. AI Teammates Are Workspace Members

AI teammates are not hidden provider bindings.

They are visible workspace principals with:

- identity
- role
- mission
- channel memberships
- task ownership
- activity history
- skill bindings
- memory surfaces
- runtime profile

### 2. Default Built-In Coding Team

The default built-in team remains:

1. `技术负责人`
2. `软件工程师`
3. `代码评审`
4. `测试工程师`

They continue to drive the first complete execution path.

### 3. Actor Shell

Every AI teammate page is a single actor shell with tabs for:

- `聊天`
- `任务`
- `活动`
- `日历`
- `频道`
- `文件`
- `技能`
- `记忆`
- `设置`

The actor shell is the main reusable product container after the app shell.

### 4. Create Teammate Wizard

Teammate creation becomes a structured wizard instead of a flat form.

The creation flow must support:

- template selection
- work-mode selection
- role and mission definition
- channel or workspace joining
- skill selection
- tool policy preview
- memory mode selection
- runtime policy selection
- confirmation

The wizard must describe the teammate in role and responsibility language,
not provider-first language.

## Coding Workflow Inside The New Shell

The current `Phase C` coding workflow is preserved but repositioned.

The user can start `编码` from:

- the workspace home shell
- the inbox when a coding request arrives
- a channel action
- a teammate page action

The workflow lifecycle remains:

- `需求澄清`
- `计划待确认`
- `执行中`
- `评审中`
- `测试中`
- `待用户确认`
- `已完成`

But those states must now render inside:

- inbox items
- task cards
- teammate activity
- channel timeline
- the actor shell

## Activity, Inbox, And Approval Model

### 1. Activity Round

Execution must not be reduced to plain chat messages.

Every meaningful teammate run becomes an `Activity Round` with:

- trigger source
- acting teammate
- phase
- summary
- tool activity preview
- artifacts or outputs
- approval requirements
- status

### 2. Inbox

Inbox items unify the main things that need human attention:

- plan approvals
- task state changes
- mentions
- teammate clarification requests
- high-risk action approvals
- failure summaries

### 3. Approval Cards

Approvals become a first-class product primitive shared across:

- coding plan approval
- destructive tool approval
- deployment approval
- high-risk file changes

Approval requests and approval responses must render as structured timeline
items, not raw text.

## Task And Calendar Model

### 1. One Task System, Multiple Scopes

Tasks are one shared system reused across:

- workspace scope
- channel scope
- teammate scope
- workflow scope

Supported views:

- `列表`
- `看板`

Supported filters:

- status
- priority
- assignee
- search
- closed-window

### 2. One Calendar System, Multiple Owners

Calendar is one shared system reused across:

- user scope
- workspace scope
- teammate scope

Supported views:

- `月`
- `周`
- `日`

## Files, Skills, And Memory

### 1. Files Surface

Channels and teammates both expose a scoped file surface.

This is not merely upload history. It represents the working file context
available to the teammate or channel.

### 2. Skills Surface

Skills become visible teammate capabilities, not a hidden infra concern.

Phase D requires:

- bundled internal skills
- workspace-bound skill enablement
- teammate-to-skill bindings
- marketplace-backed future extension

### 3. Memory Surface

Memory splits into four layers:

1. `session_memory`
   - per-run summarized context
2. `workspace_team_memory`
   - shared team knowledge tied to workspace or repo context
3. `actor_memory`
   - teammate-specific persistent identity, history, and preferences
4. `runtime_self_memory`
   - self-representation and contextual recall maintained by the internal runtime

## Internal Runtime Design

### 1. Runtime Backends

The runtime backend registry remains internal.

The main backend set becomes:

- `enhanced-hermes`
- `claude-code-internal`
- compatibility backends retained for migration only

### 2. Execution Planes

Teammates need three execution planes:

1. `in_process_teammate`
   - fast, low-latency, shared-process planning and review work
2. `isolated_workspace_session`
   - file and tool capable execution for coding tasks
3. `deferred_remote_session`
   - later path for long-running or remotely hosted execution

### 3. Enhanced Hermes Responsibilities

`enhanced-hermes` becomes the preferred general teammate runtime because it
can combine:

- OpenAI-compatible API serving
- tool execution
- memory-aware context
- skills
- self-observation
- session naming and conversation continuity

Phase D should explicitly adopt the following Hermes-derived patterns:

- async context prefetch at turn end
- dynamic reasoning level selection
- actor self-memory via observable AI peer identity
- separate user/team/actor memory modes
- cached context reuse for better latency and token efficiency

### 4. Secondary Coding Backend

The repo already reserves `claude-code-internal` as a backend contract.

Phase D defines it as the deeper coding-session backend for:

- long-form implementation
- transcript-rich code sessions
- background session restoration
- structured plan approval messaging
- advanced tool orchestration
- richer task progress reporting

### 5. Tool Policy Model

Tool access is role-bound, not globally open.

Examples:

- `技术负责人`
  - read context
  - write plans
  - request approvals
  - no broad file rewrite by default
- `软件工程师`
  - read/write code
  - run build and tests
  - produce change summary
- `代码评审`
  - inspect diffs
  - annotate risk
  - request fixes
  - no merge authority
- `测试工程师`
  - run verification
  - capture artifacts
  - summarize regressions

## Data Model Direction

Phase D should introduce or normalize the following records:

- `workspace_members`
  - with principal type `human` or `ai_teammate`
- `channels`
- `channel_memberships`
- `direct_threads`
- `inbox_items`
- `tasks`
- `task_views`
- `calendar_events`
- `activity_rounds`
- `activity_round_steps`
- `teammate_profiles`
- `teammate_skills`
- `teammate_memories`
- `workspace_team_memories`
- `approval_requests`
- `approval_events`
- `file_surfaces`
- `file_surface_entries`

Existing `conversations`, `messages`, `custom_agents`, and `coding_workflows`
should be adapted, not discarded in a big-bang rewrite.

## Delivery Scope For Phase D

Phase D is complete only when the repo has:

1. a persistent workspace shell
2. inbox, tasks, and calendar as first-class routes
3. an actor shell for AI teammates with the required tabs
4. a structured teammate creation wizard
5. the current coding workflow fully embedded in the new shell
6. first-class activity rounds and approval cards
7. a documented runtime split between `enhanced-hermes` and
   `claude-code-internal`
8. a memory model that combines workspace, actor, session, and runtime layers

## Explicit Non-Goals For This Planning Snapshot

- shipping an Electron desktop wrapper in the same implementation slice
- bilingual localization
- exposing provider brands in normal customer UI
- uploading or redistributing the local reference assets
- big-bang deletion of Phase C persistence or runtime layers
