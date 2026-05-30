# Phase D Workspace Actor Planning

## Date

- 2026-05-29

## Skills Used

- `编程技能包`
- `using-agent-skills`
- `spec-driven-development`
- `planning-and-task-breakdown`
- `documentation-and-adrs`

## Scope

This turn was planning-only.

No application code, runtime code, database code, or tests were changed.

The goal was to translate three local research inputs into one executable
planning package for `Phase D`:

- a local desktop reference app page analysis document
- a local CLI source snapshot used for defensive architecture study
- the enhanced Hermes runtime documentation already present on this machine

## Constraints Captured

- Chinese-first product language remains required
- the external benchmark brand is intentionally excluded from generated product
  artifacts
- the local research files remain local-only and are not distribution assets
- raw provider branding must stay out of the normal customer shell
- `Phase C` remains the architectural base rather than being discarded

## Main Conclusions

### 1. The next product milestone is no longer “better chat”

The reference analysis confirms that the strongest product shape is a
persistent workspace shell with:

- inbox
- tasks
- calendar
- channels
- AI teammate actor shells
- settings sections

So `Phase D` redefines the product around those route families.

### 2. AI teammates must become first-class workspace actors

The local CLI source snapshot was useful not because of branding, but because
it exposes several transferable mechanisms:

- structured plan approval messages
- teammate task containers
- local versus remote task distinction
- teammate creation wizard patterns
- session memory extraction
- team memory synchronization

Those patterns informed the `ActorShell`, `ActivityRound`, and `ApprovalCard`
requirements in the new spec.

### 3. The preferred runtime should absorb more context and memory work

The enhanced Hermes material is now the clearest path for the preferred
built-in runtime because it already supports:

- an OpenAI-compatible API server
- tool execution
- memory-aware context layering
- self-observation patterns
- async prefetch strategies

That led to the Phase D requirement that the preferred backend adopt:

- async context prefetch
- actor self-memory
- separate memory modes
- cached turn-to-turn context reuse

### 4. The second coding backend remains important, but bounded

The current repo already reserves `claude-code-internal` by contract.

Phase D does not erase that direction. Instead, it narrows the role:

- preferred backend handles general teammate execution
- secondary coding backend handles deeper coding-session behavior

This keeps runtime evolution explicit instead of ambiguous.

## Files Added

- `ai/specs/2026-05-29-phase-d-workspace-actor-platform.md`
- `ai/plans/phase-d-workspace-actor-platform-plan.md`
- `ai/tasks/phase-d-workspace-actor-platform-tasks.md`
- `ai/logs/2026-05-29-phase-d-workspace-actor-planning.md`
- `ai/plans/README.md`

## Files Updated

- `ai/specs/README.md`
- `ai/tasks/README.md`
- `ai/logs/README.md`

## Outcome

The repo now has a complete `Phase D` planning package that:

- translates the local reference app into product requirements without copying
  its brand into generated artifacts
- combines actor-shell and approval patterns from the local CLI source snapshot
- combines self-evolving runtime and memory patterns from the preferred runtime
- provides a dependency-ordered execution path instead of an aspirational
  redesign memo
