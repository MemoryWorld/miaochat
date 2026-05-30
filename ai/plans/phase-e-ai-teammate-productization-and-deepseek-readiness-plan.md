# Plan: Phase E AI Teammate Productization And DeepSeek Readiness

## Overview

This phase turns the current `AI 同事` shell into a product customers can
actually understand and test. The page audit expands the phase from connection
and teammate work into a broader productization pass: context correctness,
compact workspace shell, usable core pages, teammate customization, model
connection, and real DeepSeek-backed coding acceptance.

## Architecture Decisions

- Customer-visible `provider` language should be replaced by `模型连接` and
  `AI 同事` language.
- Hidden execution backend selection stays server-side and does not appear in
  public contracts.
- `DeepSeek` is the only public model connection option in this phase.
- Context correctness is the first implementation priority because workspace
  and channel mismatches break user trust.
- Daily-use pages should be operational tools with clear actions, not product
  concept explainers.
- Teammate creation will use richer setup dimensions modeled after the local
  reference runtime configuration flow, but rewritten into product language.
- Coding workflow acceptance must use a real DeepSeek key before this phase can
  close.

## Dependency Order

### Phase 0: Trust And Context Correctness

Goal: fix scope correctness before adding more features.

Build first:

1. active workspace single source of truth
2. channel loader shared by all channel tabs
3. tests for channel chat/files context preservation
4. tests for settings sections using the active workspace
5. dev-time detection for silent fallback workspace usage

Why first:

- users cannot trust the product if the same page family shows different
  workspace or channel state
- model connections and teammate profiles are workspace-scoped, so the scope
  contract must be correct first

### Phase 1: Vocabulary, Shell, And Public Contract Reset

Goal: remove backend/provider exposure from the product surface, define the new
public nouns, and reduce the logged-in shell to a compact tool frame.

Build first:

1. product vocabulary baseline
2. public contract inventory
3. migration strategy from provider-centric settings to model connections
4. compact workspace shell rules
5. duplicate settings-entry cleanup

Why first:

- UI and API changes will otherwise drift
- teammate creation cannot be redesigned until public naming is fixed
- DeepSeek settings should not be layered onto the old provider-centric shape
- inbox, task, calendar, and channel pages need a shared shell standard

### Phase 2: Workbench And Core Tool Pages

Goal: make the main navigation pages useful before deeper AI configuration.

Build second:

1. workbench as launcher and resume surface
2. inbox queue, filters, detail, and actions
3. task list/board skeleton, create, search, and filters
4. calendar month/week/day grid and event creation
5. channel overview search, create, filters, sort, and shortcuts
6. channel timeline event types and recovery actions
7. meaningful empty states

Why second:

- these pages define the customer's daily loop
- the current pages are too explanation-heavy to validate product direction
- channel recovery actions are needed before DeepSeek real-key runs fail in
  confusing ways

### Phase 3: Settings And Connection Model

Goal: replace provider-centric credential entry with a DeepSeek-first connection
flow that administrators can understand.

Build third:

1. connection schema
2. settings section redesign
3. validation flow
4. workspace default selection
5. disabled-reason modeling
6. product-safe connection errors

Why third:

- teammate creation needs a stable connection model to reference
- workflow execution must know how to resolve a usable DeepSeek connection

### Phase 4: Teammate Creation Redesign

Goal: remove `运行策略`, add `自定义`, and expand teammate customization depth.

Build fourth:

1. template catalog rewrite
2. wizard step redesign
3. advanced teammate profile schema
4. customer-safe summary cards
5. simple-create path
6. advanced-settings path
7. template prefill and disabled-reason behavior

Why third:

- the wizard should target the new connection and model profile concepts
- workflow launch needs richer teammate metadata once settings are in place

### Phase 5: Workspace Administration Surfaces

Goal: make settings, members, billing, and capability management look like
credible product surfaces.

Build fifth:

1. account/profile settings with preferences and security placeholders
2. workspace settings with active workspace truth
3. member directory fields for role, status, invite, last active, disable, and
   ownership planning
4. billing skeleton with plan, usage, quota, cost breakdown, invoice, payment,
   and upgrade areas
5. capability management skeleton with install, enable, version, permission,
   compatible roles, source, and risk notes

Why fifth:

- these surfaces complete the management story without blocking the primary
  model connection and teammate creation loops

### Phase 6: Workflow Runtime Integration

Goal: make the coding workflow truly consume the new connection model and
teammate profile options.

Build sixth:

1. API routing from workspace default connection to workflow launch
2. hidden runtime resolution
3. teammate-level model preference application
4. product-safe runtime errors
5. failure recovery events

Why fourth:

- there is no value in a new form if the workflow still runs through the old
  provider assumptions

### Phase 7: UI Polish And Real Acceptance

Goal: close visible gaps and prove the feature with a real DeepSeek key.

Build last:

1. workspace switcher overflow fix
2. remaining copy scrub
3. real-key acceptance
4. demo runbook updates

Why last:

- final polish only matters once the runtime path is real

## Implementation Checkpoints

### Checkpoint A: Public Contract Freeze

After Phase 1:

- all customer-facing nouns are agreed
- a concrete migration path exists
- any still-exposed backend/provider names are enumerated
- compact shell rules are agreed

### Checkpoint B: Core Pages Ready

After Phase 2:

- workbench no longer duplicates full channel chat
- inbox, tasks, calendar, and channel overview expose real operations
- channel failure events expose recovery actions

### Checkpoint C: Settings Ready

After Phase 3:

- a workspace can create and validate a DeepSeek connection
- the settings IA is stable enough for teammate work to build on

### Checkpoint D: Teammate Creation Ready

After Phase 4:

- users can create a fully custom teammate
- no customer-visible `运行策略` wording remains
- teammate profiles can express enough configuration to replace the old shortcut

### Checkpoint E: Admin Surfaces Ready

After Phase 5:

- members, billing, and capability management are credible skeletons
- settings no longer read like a configuration blueprint

### Checkpoint F: Real Workflow Path Ready

After Phase 6:

- coding workflow execution can resolve a DeepSeek connection
- product-safe error handling exists
- approval-first semantics are preserved

### Checkpoint G: Phase Closeout

After Phase 7:

- overflow defect is gone
- real-key acceptance passes
- docs and tests match the shipped behavior

## Risks And Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Old provider enums leak into new UI contracts | High | Introduce a new public connection model instead of reusing raw provider fields in the client |
| Channel tabs or settings sections keep showing mismatched scope | High | Move context fixes to Phase 0 and gate later work on route/workspace tests |
| Phase E becomes too broad to finish coherently | High | Treat context, core pages, connection, teammates, admin, and runtime as ordered checkpoints |
| Settings redesign and teammate redesign diverge | High | Freeze vocabulary and payload contracts before implementing either side |
| DeepSeek validation stops at string-format checks | High | Require live validation against the official endpoint |
| Workflow still depends on hidden provider labels in server logic | High | Add a server-only translation layer and test it directly |
| Teammate wizard becomes too complex | Medium | Keep a short default path plus advanced sections, not one giant flat form |
| Core pages become cosmetic skeletons again | Medium | Every core page task must include at least one primary action, filters or navigation, and a meaningful empty state |
| Missing second backend source causes scope confusion | Medium | Keep the second backend strictly out of live acceptance for this phase |
| Legacy docs and demo text keep leaking old names | Medium | Include a documentation scrub task and treat product docs as part of acceptance |

## Parallelization Opportunities

Safe parallel work once implementation begins:

- product copy scrub and IA updates
- inbox, tasks, calendar, and channel overview UI skeletons after shell rules are frozen
- settings page UI redesign
- teammate wizard UI redesign after connection contracts are frozen
- contract-test authoring after schemas are defined

Must remain sequential:

- context correctness before every workspace-scoped feature
- connection schema before settings persistence
- settings persistence before workflow runtime wiring
- runtime wiring before real-key acceptance

Needs coordination:

- public contract naming between `packages/contracts`, `apps/api`, and
  `apps/web`
- teammate profile fields shared by wizard, actor pages, and workflow launch

## Open Questions

- Should the first customer-visible DeepSeek UI expose one connection only, or
  allow multiple named connections per workspace?
- Should teammate-level model preference be a simple preset or a full advanced
  editor in this phase?
- Should existing provider-centric records be migrated in place or wrapped by a
  new table/API layer first?
- Should the left navigation keep `AI 同事` hidden as requested earlier, or
  reintroduce it later only after teammate management becomes a real tool page?
- How much billing detail is needed before the first external customer test:
  usage skeleton only, or plan/quota/invoice placeholders as well?
