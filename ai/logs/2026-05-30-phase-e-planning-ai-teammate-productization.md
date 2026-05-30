# 2026-05-30 Phase E Planning AI Teammate Productization

## Goal

Turn the user's latest product direction into a detailed next-phase plan without
writing application code.

## Skills Used

- `using-agent-skills`
- `spec-driven-development`
- `planning-and-task-breakdown`
- `api-and-interface-design`

## Inputs Applied

The user asked for a planning-only phase that does all of the following:

- remove customer-visible backend/provider naming
- keep the product language centered on `AI 同事`
- make teammate creation support a true `自定义` path
- remove the `运行策略` step
- redesign teammate setup to match the richness of the local reference agent
  setup flow without exposing runtime origins
- fix the workspace-switcher overflow defect
- add a settings path for real API access
- support `DeepSeek` first
- ensure collaborative coding can become truly usable with a real DeepSeek key

## Local Verification Performed

I reviewed the current workspace and confirmed:

1. The current teammate creation wizard still exposes a `运行策略` step and
   several hidden-backend labels.
2. The current settings experience is still provider-centric and embedded in the
   old setup flow.
3. The workspace switcher currently uses a plain select without truncation or
   overflow control for long names.
4. The public contract layer still exposes old provider enums.
5. The expected second internal coding-backend source directory is not present
   locally right now, so the next phase can only plan a boundary for it.

I also checked the local reference runtime configuration docs and used them only
to derive customer-safe configuration dimensions:

- model/provider selection
- memory and context layering
- approvals and autonomy
- tools and skills
- fallback and runtime preferences

Finally, I verified current DeepSeek API direction against the official docs on
`2026-05-30`, including:

- official base URL
- Anthropic-compatible endpoint
- current V4 model line
- deprecation guidance for older aliases

## Artifacts Created

- `ai/specs/2026-05-30-phase-e-ai-teammate-productization-and-deepseek-readiness.md`
- `ai/plans/phase-e-ai-teammate-productization-and-deepseek-readiness-plan.md`
- `ai/tasks/phase-e-ai-teammate-productization-and-deepseek-readiness-tasks.md`

## 2026-05-30 Audit Merge

After the initial Phase E plan, the user provided a page audit. I merged its
shortcomings into Phase E without carrying external reference naming into the
new planning documents.

Added scope:

- channel files tab must preserve channel context
- settings and model-connection pages must preserve active workspace context
- logged-in pages need a compact daily-use shell
- workbench should become a launcher and resume surface
- inbox needs queue, filters, detail, and actions
- tasks need create, search, filters, list, and board behavior
- calendar needs real time grids and event creation
- channel overview needs search, create, filter, sort, and shortcuts
- channel timeline failures need recovery actions
- settings need account/workspace/AI platform grouping
- profile, members, billing, and capability management need credible management
  skeletons
- teammate creation needs simple and advanced modes, template prefill, disabled
  reasons, and customer-safe summaries

Conflicts captured:

1. The first Phase E ordering put workspace-switcher polish late. The audit
   correctly promotes workspace/channel context correctness to the first phase.
2. The first Phase E scope focused on model connection and teammate creation.
   The audit expands the phase to include core page maturity.
3. Earlier product direction removed the AI teammate directory from the main
   left navigation. The audit suggests a broader teammate IA. The merged plan
   keeps main navigation conservative and treats teammate management as a route
   and creation flow until a stronger directory is justified.
4. The audit discusses provider/runtime/credential/policy distinctions. The
   merged plan keeps those as internal architecture concepts while preserving
   customer-facing `模型连接` language.

## Scope Boundary

This planning slice does **not** implement code.

It only:

- defines the product direction
- freezes the major contract changes
- orders the implementation work
- identifies the real-key acceptance gate for DeepSeek

## Why This Order

The next implementation phase should not start with UI polish or another round
of runtime hacking.

The correct order is:

1. freeze customer-facing naming and contract language
2. redesign settings around `模型连接`
3. redesign teammate creation around rich configuration
4. wire the workflow to the new hidden runtime resolution path
5. only then do the DeepSeek real-key acceptance run
