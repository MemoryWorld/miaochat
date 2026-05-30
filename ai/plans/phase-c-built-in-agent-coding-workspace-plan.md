# Plan: Phase C Built-In Agent Coding Workspace

## Plan Status

Implements the active snapshot in
[ai/specs/2026-05-28-phase-c-built-in-agent-coding-workspace.md](../specs/2026-05-28-phase-c-built-in-agent-coding-workspace.md).

This is the first executable plan for shifting the product from
provider-centric chat to a Chinese-first built-in AI workforce model.

## Planning Constraints

- Keep the current `web -> api -> worker -> runtime` substrate
- Keep Chinese as the only first-class product language in this phase
- Hide provider names from the customer-facing shell
- Focus the first complete experience on `编码`
- Treat `enhanced-hermes` as the preferred internal runtime direction
- Do not begin Claude internal runtime implementation until the user supplies
  the prior source tree

## Architecture Decisions

### 1. Work Mode Comes Before Provider

The first post-login action becomes `选择工作模式`, not provider setup or raw
chat creation. `/setup` becomes an advanced/admin path.

### 2. Built-In Roles Come Before User-Authored Teams

The fastest path to a coherent product is a strong default coding team:

- 技术负责人
- 软件工程师
- 代码评审
- 测试工程师

User-defined AI teammates layer on after the default team and its orchestration
contract are stable.

### 3. The Tech Lead Owns The Plan Gate

Every coding workflow starts with the `技术负责人` producing a plan and asking
for human confirmation. This becomes the core human-in-the-loop product pattern.

### 4. Runtime Backends Are Internal Infrastructure

The product should execute against internal runtime backends, but the UI should
only expose teammate identity, role, state, and approvals unless the user is in
an advanced admin/debug view.

### 5. Compatibility Mapping Beats Big-Bang Schema Rewrite

The first implementation wave should reuse current conversations, messages,
custom agents, and artifacts where possible. Hard persistence model changes
should follow only after the coding-workflow surface is proven.

## Implementation Order

### Phase C1: Product Entry Rewrite

1. Replace setup-first entry with a work-mode launcher
2. Add a Chinese `编码` mode card as the primary CTA
3. Keep other modes visible but inactive if needed

### Phase C2: Built-In Teammate Surface

1. Reframe `/agents` into `AI 同事`
2. Add built-in teammate cards with role explanations
3. Distinguish built-in teammates from user-defined teammates

### Phase C3: Coding Workflow Template

1. Add a coding workflow starter
2. Generate the default four-role team
3. Start every workflow in `计划待确认`

### Phase C4: Plan Gate And Execution Stages

1. Make `技术负责人` submit a visible plan
2. Add approve/reject/revise interactions
3. Only after approval may execution proceed to engineering/review/testing

### Phase C5: Timeline, Tasks, And Approvals

1. Surface workflow stages in the main timeline
2. Add task state visibility:
   - `待办`
   - `进行中`
   - `待审核`
   - `已完成`
3. Add approval cards and visible human decisions

### Phase C6: Internal Runtime Migration

1. Introduce an internal runtime backend registry
2. Start shaping `enhanced-hermes` as the preferred built-in runtime path
3. Leave the future Claude internal runtime as a planned second backend

## Verification Checkpoints

### Checkpoint 1: Entry Loop

- Login lands in a Chinese work-mode-first product shell
- The shell no longer reads as a provider console
- `/setup` is no longer the first product story

### Checkpoint 2: Default Coding Team Loop

- A user can choose `编码`
- The system recommends the four default roles
- The user can start the workflow without understanding providers

### Checkpoint 3: Plan Gate Loop

- `技术负责人` posts a plan first
- Human confirmation is required before execution
- Workflow state visibly changes when approved or rejected

### Checkpoint 4: Execution Loop

- Engineering, review, and QA stages are all visible
- Timeline and task state remain aligned
- Approval history stays attached to the same workspace context

## Risks And Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Product keeps leaking provider language into the shell | High | Add copy review and UI tests that assert built-in role language |
| Trying to implement Claude internal runtime too early | High | Keep it spec-only until the source tree is provided |
| Work-mode launcher becomes a visual shell with no real workflow semantics | High | Make `计划待确认` the first hard milestone, not just a UI card |
| Schema churn slows delivery | High | Use compatibility mapping before new persistence entities |
| Over-fitting to reference visuals instead of product loops | Medium | Prioritize flow, roles, approvals, and task semantics over pixel cloning alone |

## Exit Condition

This plan is ready for execution when the repo has:

1. the active built-in-agent coding workspace spec
2. a dependency-ordered task file aligned with this plan
3. the `/agents` bug fix and log closed
4. the next coding slice starting from the work-mode entry and built-in
   teammate surfaces
