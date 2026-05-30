# Plan: Phase D Workspace Actor Platform

## Plan Status

Implements the active snapshot in
[ai/specs/2026-05-29-phase-d-workspace-actor-platform.md](../specs/2026-05-29-phase-d-workspace-actor-platform.md).

This plan moves the product from a coding-workflow shell to a full
workspace-and-actor operating model.

## Planning Constraints

- Keep the existing `web -> api -> worker -> internal runtime` substrate
- Keep Chinese as the only first-class product language in this phase
- Do not surface provider brands in the normal customer journey
- Do not reference the external benchmark brand in generated artifacts
- Reuse current `conversations`, `messages`, `custom_agents`, and
  `coding_workflows` where doing so reduces migration risk
- Treat `enhanced-hermes` as the preferred general teammate runtime
- Treat `claude-code-internal` as the deeper coding-session backend already
  reserved by contract
- Do not start a native desktop packaging effort until the renderer shell is
  coherent on the web

## Architecture Decisions

### 1. Shell First, Feature Pages Second

The persistent workspace shell is the new root product unit.

The first implementation work must stabilize:

- left navigation model
- top utility strip
- shared route outlet
- workspace and account menus

Feature pages come after the shell contracts exist.

### 2. Actor Shell Is The Main Product Primitive After App Shell

AI teammates are promoted from “special agents” to “workspace actors”.

Each actor gets the same shell tabs:

- 聊天
- 任务
- 活动
- 日历
- 频道
- 文件
- 技能
- 记忆
- 设置

This should be one generic shell, not many special pages.

### 3. Shared Task And Calendar Systems Beat Page-Specific Variants

The reference analysis shows one task system and one calendar system reused
with different scopes.

We should do the same:

- one task query layer
- one list/board renderer
- one calendar engine
- one owner/scope adapter

### 4. Execution Must Be Visible Outside Chat

Execution traces become `activity_rounds`, not only timeline messages.

The product must expose the same work through:

- timeline messages
- actor activity feed
- inbox items
- task state
- approval history

### 5. Teammate Creation Must Become Structured Team Design

The current flat custom-agent flow is not enough.

Phase D should replace it with a structured teammate wizard that can express:

- template
- work mode
- role and mission
- channels
- skills
- memory mode
- runtime policy

### 6. Memory Is A Product Surface, Not Only Runtime Internals

The local CLI source snapshot and Hermes docs point to complementary strengths:

- session memory extraction
- team memory synchronization
- actor self-representation
- async contextual recall

Phase D should expose memory as both product and infra:

- visible memory tabs for humans
- cached contextual memory for runtimes

### 7. Runtime Needs Multiple Execution Planes

Built-in teammates cannot all run the same way.

We need:

- in-process teammate execution for planning and lightweight coordination
- isolated workspace sessions for engineering work
- deferred remote sessions as a future-compatible background model

### 8. Renderer Parity Before Native Shell

The reference app is desktop-packaged, but Phase D should first reach renderer
parity in the current web substrate.

Desktop packaging can follow once:

- shell structure
- actor routes
- realtime behavior
- settings surfaces

are stable.

## Implementation Order

### Phase D0: Guardrails And Vocabulary

1. Record naming constraints and banned-product-copy rules
2. Freeze the Phase D Chinese product vocabulary
3. Define route families and page primitive ownership

### Phase D1: Workspace Shell Rewrite

1. Replace the current home shell with a persistent workspace shell
2. Add workspace switcher, top utility strip, and left navigation groups
3. Introduce route slots for inbox, tasks, calendar, channels, teammates, and
   settings

### Phase D2: Shared Data Primitives

1. Add normalized inbox, task, calendar, activity, and teammate profile
   contracts
2. Extend persistence model for workspace members, actor tabs, activity rounds,
   approvals, and file surfaces
3. Build compatibility adapters from existing conversations and coding
   workflows

### Phase D3: Inbox, Task, And Calendar Families

1. Build `InboxView`
2. Build shared `TaskView` with list and board modes
3. Build shared `CalendarView` with month/week/day modes
4. Wire scope injection for workspace and teammate variants

### Phase D4: Actor Shell

1. Build `ActorShell` layout and tab registry
2. Reframe current teammate pages into actor pages
3. Add actor-scoped chat, tasks, activity, calendar, channels, files, skills,
   memory, and settings tabs

### Phase D5: Channels And Files

1. Promote channels to first-class navigation entries
2. Build channel chat + files shell
3. Add teammate-to-channel membership and visibility model

### Phase D6: Structured Teammate Creation

1. Replace the current flat form with a wizard
2. Add template catalog
3. Add skill, memory, and runtime configuration steps
4. Preserve user-defined teammate capability under the new model

### Phase D7: Activity And Approval System

1. Add activity rounds and round-step persistence
2. Add structured approval request and response cards
3. Feed approvals into inbox, timeline, and activity views
4. Refactor coding-plan approvals to use the same product primitive

### Phase D8: Internal Runtime Evolution

1. Split runtime orchestration into execution planes
2. Map planning/review teammates to fast in-process or lightweight runtime paths
3. Map coding execution to isolated workspace sessions
4. Preserve Phase A compatibility backends for fallback only

### Phase D9: Memory And Skill System

1. Add workspace team memory layer
2. Add actor memory layer
3. Add session memory extraction loop
4. Adopt Hermes-style async context prefetch and actor self-memory
5. Add visible skills surface and binding model

### Phase D10: Settings, Credentials, Billing, Marketplace

1. Convert settings into a section-driven host
2. Move credentials to an advanced settings section
3. Add member management with AI teammates as first-class members
4. Add billing and marketplace placeholders or real surfaces consistent with
   the shell

### Phase D11: Verification And Cutover

1. Add shell-level route tests
2. Add actor-shell integration tests
3. Add inbox/task/calendar scoped tests
4. Add runtime-path integration for `enhanced-hermes`
5. Add contract tests for `claude-code-internal` readiness boundaries

## Verification Checkpoints

### Checkpoint 1: Shell Parity

- a logged-in user lands in a stable workspace shell
- the left nav contains inbox, tasks, calendar, channels, teammates, and DMs
- the product no longer reads as a setup-first or provider-first console

### Checkpoint 2: Actor Parity

- opening an AI teammate shows an actor shell with the required tabs
- actor tasks and actor calendar reuse the same underlying page primitives
- activity is visible outside the chat transcript

### Checkpoint 3: Workflow Embedding

- the coding workflow launches from the new shell
- the tech-lead plan gate still works
- approvals appear in inbox, timeline, and actor activity

### Checkpoint 4: Runtime And Memory

- `enhanced-hermes` remains the preferred built-in backend
- runtime memory uses async prefetch and actor-aware context
- the second coding backend boundary remains explicit and testable

### Checkpoint 5: Admin And Extensibility

- settings are section-driven
- credentials are advanced, not primary
- skills and marketplace concepts exist in the shell
- AI teammates appear as manageable workspace members

## Risks And Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| The shell rewrite leaks old provider-first language | High | Add copy review, UI snapshots, and route-level tests for banned product framing |
| The actor shell becomes too large and inconsistent | High | Create one tab registry and one actor layout contract before feature implementation |
| Rebuilding tasks/calendar separately per scope causes duplication | High | Land shared primitives first, then inject scope |
| Activity and timeline diverge into two truth sources | High | Make activity rounds the canonical execution record and derive UI projections from them |
| Memory becomes invisible runtime magic again | Medium | Add explicit memory surfaces and contracts before runtime automation expands |
| The second coding backend is implemented too early or too vaguely | High | Keep contract-visible boundaries and staged readiness checks; no silent fallback pretending it exists |
| Trying to ship desktop packaging too early slows everything | Medium | Renderer parity first; native shell remains a later packaging step |

## Exit Condition

This plan is ready for execution when the repo has:

1. the active Phase D spec
2. a dependency-ordered task file aligned with this plan
3. a planning log that records the local reference inputs and constraints
4. updated AI documentation indexes that point to the Phase D package
