# Plan: Phase C Chinese AI Workforce Overhaul

## Plan Status

Implements the snapshot in
[ai/specs/2026-05-28-phase-c-chinese-ai-workforce-overhaul.md](../specs/2026-05-28-phase-c-chinese-ai-workforce-overhaul.md).

This plan is a program-level rebuild plan, not a promise to land everything in
one coding slice.

## Planning Constraints

- Preserve the existing runtime substrate and Phase A real-provider path.
- Recenter the product around channels, tasks, teammates, and approvals.
- Keep the rebuild Chinese-first.
- Do not start a bilingual i18n program yet.
- Do not spend this phase on new provider integrations.
- Avoid legal-risk cloning of reference brand assets or verbatim copy.

## Architecture Decisions

### 1. Rebuild The Product Shell Before Expanding Runtime Breadth

The current gap versus the reference product is primarily product shape, not provider count.
`Hermes` and `OpenClaw` are enough to support the next shell iteration while
the app learns to present AI teammates, channels, and tasks as first-class
concepts.

### 2. Treat Provider Runtime As Infrastructure, Not The Product Center

`/setup` remains necessary, but it should move toward a settings/supporting
surface. The main user journey should begin in a workspace shell, not in raw
provider credential forms.

### 3. Introduce The New Product In Layers

The safest order is:

1. shell and navigation
2. channel-style timeline
3. teammate directory and identity surfaces
4. task system
5. coding-session and approval surfaces
6. external integrations

This keeps the repository working while the new product model is layered over
the existing runtime.

### 4. Use Compatibility Views Before Hard Data Replacements

Where possible, the first UI slices should map existing `conversations`,
`custom agents`, and message timelines into new channel/workspace concepts.
Hard schema replacement should happen after the product shell proves itself.

### 5. Freeze Chinese Product Vocabulary Early

If terminology changes late, every page, seed flow, and test breaks in noisy
ways. Navigation and core nouns should be frozen before major UI implementation
starts.

## Implementation Order

### Phase C0: Strategy And Guardrails

1. Record the rebuild spec, plan, tasks, and decision log.
2. Freeze Chinese-first vocabulary and legal guardrails.
3. Define the first UI reference frame and scope cut.

### Phase C1: Chinese Workspace Shell

1. Replace the current demo/setup-first framing with a workspace-first shell.
2. Introduce top-level Chinese navigation and left-rail information
   architecture.
3. Demote raw provider messaging to secondary settings surfaces.

### Phase C2: Channel Timeline

1. Reframe the main conversation view as a channel timeline.
2. Add Chinese tabs for chat/files/pinned or their chosen equivalents.
3. Make human / AI / system authorship explicit and consistent.

### Phase C3: AI Teammates

1. Replace provider-centric agent presentation with teammate-centric profiles.
2. Add role-aware teammate cards and membership surfaces.
3. Connect seeded agents to visible teammate roles.

### Phase C4: Tasks

1. Add a task list / board view.
2. Model visible states like `待办`, `进行中`, `待审核`, `已完成`.
3. Show task ownership by humans and AI teammates in one shared surface.

### Phase C5: Coding Sessions And Approvals

1. Add a reviewable execution-session surface for coding work.
2. Reuse artifacts and diffs where possible.
3. Introduce human approval cards for sensitive actions.

### Phase C6: External Work Surfaces

1. Add placeholders or early adapters for email / meetings / deploy actions.
2. Keep these clearly marked if they are preview-only.

## Verification Checkpoints

### Checkpoint 1: Shell Freeze

- Chinese-first information architecture is approved.
- Terminology is frozen.
- Existing app still builds and current runtime tests still pass.

### Checkpoint 2: Channel Loop

- Workspace shell and channel timeline are navigable.
- Provider setup is no longer the central product story.
- Existing seeded/demo data remains usable.

### Checkpoint 3: Task Loop

- A human can see tasks, ownership, and state transitions in the same product
  shell as messages.
- AI teammate identity is clearer than raw provider identity.

### Checkpoint 4: Execution Loop

- Coding-session and approval surfaces connect back into the timeline.
- The product now resembles the target AI workforce model instead of a chat
  runtime demo.

## Risks And Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Over-focusing on visual mimicry before IA clarity | High | Freeze nouns, nav, and core product entities before major styling work |
| Breaking the current runtime path during shell migration | High | Keep Phase A runtime tests as non-negotiable regression checks |
| Introducing too many entities at once | High | Use compatibility mapping before schema replacement |
| English copy leaking into the Chinese shell | Medium | Make Chinese-first copy a boundary and review criterion |
| Legal risk from copying the reference product too literally | High | Copy interaction patterns, not trademarked assets or exact copy |

## Exit Condition

This planning milestone is complete when the repository has one approved
Chinese-first overhaul spec, one ordered implementation plan, one first-wave
task list, and one decision log that future implementation slices can follow.
