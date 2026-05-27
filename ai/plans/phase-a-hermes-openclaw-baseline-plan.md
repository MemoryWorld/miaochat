# Plan: Phase A Hermes + OpenClaw Baseline

## Plan Status

This plan implements the milestone snapshot in
[ai/specs/2026-05-28-phase-a-hermes-openclaw-baseline.md](../specs/2026-05-28-phase-a-hermes-openclaw-baseline.md).

It is intentionally narrower than the root [SPEC.md](../../SPEC.md) and exists
to drive the next code phase without pretending the full Release 1 target is
already complete.

## Planning Constraints

- `Phase A` must not add new provider families.
- `Phase A` must not rewrite the full Release 1 vision out of the repo.
- `Hermes` and `OpenClaw` are the only real-runtime providers in scope.
- Existing adapter contracts remain the shared boundary.
- The first engineering goal is runtime wiring, not protocol expansion.
- Delivery evidence must stay proportional to the milestone:
  demo proof and aligned docs matter more than placeholder load-test coverage.

## Architecture Decisions

### 1. Treat Phase A As A Milestone, Not As A Release Rename

The repository keeps the long-term `Release 1` target. `Phase A` is the
execution slice that removes the current ambiguity around "minimum requirement
done" versus "full release not done."

### 2. Runtime Wiring Comes Before More Provider Work

The most important missing behavior is the execution path from API -> worker ->
adapter. Provider count is secondary until the application stops hardcoding the
mock runtime.

### 3. Real Provider Routing Should Be Centralized

Provider selection belongs in a small factory boundary shared by the worker
activities. The API should stop enforcing a mock-only direct conversation rule
for supported providers.

### 4. Acceptance Must Prove The Product Loop, Not Just Adapter Parsing

The current repo already proves much of the protocol normalization at the
adapter layer. `Phase A` must add evidence that the browser/API/worker/runtime
loop actually uses `Hermes` and `OpenClaw`.

### 5. Deferred Providers Stay Explicitly Deferred

`Codex`, `Claude Code`, and `morph-labs/hermes-agent-fork` remain visible in
the docs, but they do not enter the dependency chain for this milestone.

## Dependency Graph

Milestone docs
    ->
runtime provider factory
    ->
API direct-message gating changes
    ->
worker direct + group routing
    ->
runtime integration tests
    ->
provider acceptance + BYOK baseline checks
    ->
demo evidence and milestone closeout docs

## Implementation Order

### Phase 1: Milestone Alignment

- Add the milestone spec, plan, tasks, and execution log.
- Freeze the definition of "done" for `Phase A`.

### Phase 2: Runtime Routing Foundation

- Introduce one provider adapter factory for supported real providers.
- Define how `mock` remains available for tests without remaining the default
  execution path.

### Phase 3: Direct Conversation Wiring

- Remove the direct-conversation mock-only guard for supported providers.
- Route direct agent execution through the provider factory.

### Phase 4: Group Orchestration Wiring

- Route group dispatch through the same provider factory.
- Preserve failure handling, tracing, and metrics behavior.

### Phase 5: Acceptance Closure

- Add or update tests so direct chat, group orchestration, pinned context, and
  stream event normalization are proven over the real runtime path for
  `Hermes` and `OpenClaw`.
- Verify the minimal BYOK setup path for these two providers.

### Phase 6: Delivery Closeout

- Update milestone-facing docs to reflect real status.
- Capture runnable demo evidence and remaining gaps such as the demo video.

## Risks And Mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Runtime wiring leaks provider-specific branching across the codebase | High | Centralize selection in one adapter factory and keep activities thin |
| Direct path is fixed but group path still silently uses mock | High | Treat direct and group routing as one milestone, not separate "nice to have" tasks |
| Hermes shim evidence is mistaken for production runtime design | Medium | Keep test-only caveats explicit in docs and acceptance notes |
| Milestone docs drift from root Release 1 docs | Medium | Keep `Phase A` positioned as a snapshot and defer any root-spec rewrite until human approval |
| Acceptance remains adapter-only and misses app-level behavior | High | Require runtime integration checks in addition to provider protocol specs |

## Verification Checkpoints

### Checkpoint A: Docs Ready

- `Phase A` spec, plan, tasks, and log exist in the repo.
- Deferred scope is explicit.

### Checkpoint B: Runtime Ready

- Direct path accepts supported real providers.
- Worker activities select providers through the factory.

### Checkpoint C: Acceptance Ready

- Integration and e2e coverage prove the real runtime path for `Hermes` and
  `OpenClaw`.
- Minimal BYOK flow for these providers is documented and verified.

### Checkpoint D: Milestone Closeout

- Demo evidence is captured.
- Remaining items are listed as deferred rather than left ambiguous.

## Parallelization Strategy

- Docs and task alignment can happen immediately.
- Direct and group routing can be implemented sequentially but share the same
  factory contract.
- BYOK verification and demo evidence should wait until runtime wiring is
  stable.
- Deferred-provider work should not run in parallel with `Phase A`; it expands
  scope without helping the first milestone land.

## Exit Condition

The next implementation turn can start when:

- the milestone definition is written down
- the dependency order is accepted
- the next coding task begins with runtime wiring rather than provider sprawl
