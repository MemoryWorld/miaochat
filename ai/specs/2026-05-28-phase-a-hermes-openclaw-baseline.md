# Spec Snapshot: Phase A Hermes + OpenClaw Baseline

## Status

Drafted on `2026-05-28` to align the current execution milestone before any
new business-code work continues.

This snapshot does **not** replace the repository-wide product target in
[SPEC.md](../../SPEC.md). It narrows the next implementation milestone so the
repo can stop mixing:

- "the minimum original requirement is already close"
- "the full Release 1 four-provider target is not done yet"

## Assumptions I'm Making

1. The immediate goal is to satisfy the minimum bar in
   [docs/product/original-requirements.md](../../docs/product/original-requirements.md),
   not to declare the full four-provider Release 1 cut complete.
2. The current highest-value gap is the real runtime path, because adapter
   coverage already exists for `Hermes` and `OpenClaw` while the API/worker
   execution chain still defaults to `mock`.
3. `Codex`, `Claude Code`, and `morph-labs/hermes-agent-fork` should be treated
   as explicit follow-on work, not as hidden scope inside this milestone.
4. This milestone is allowed to tighten docs, plans, and acceptance criteria
   before touching application logic.
5. The repo should keep the long-term four-provider Release 1 vision visible,
   but day-to-day execution should be gated by a smaller, dependency-ordered
   milestone.

If any of these assumptions are wrong, this snapshot should be corrected before
the next implementation task starts.

## Objective

Define a short, auditable milestone named `Phase A: Hermes + OpenClaw
Baseline`.

`Phase A` exists to produce one unambiguous statement:

> Miaochat has a working multi-agent baseline centered on `Hermes` and
> `OpenClaw`, including real runtime wiring, core acceptance coverage, and
> delivery evidence aligned with the original requirement floor.

This milestone is intentionally narrower than the full repository-level
`Release 1` target.

## Commands

These commands are the expected verification surface while implementing
`Phase A`:

```bash
pnpm lint
pnpm test
pnpm test:integration
pnpm test:e2e
pnpm test:e2e:providers
pnpm shim:openclaw
pnpm shim:hermes
```

Commands intentionally **not** required for `Phase A` sign-off:

```bash
pnpm test:e2e:byok:staging
pnpm test:e2e:staging
k6 run tests/load/session-list.js
k6 run tests/load/send-message.js
k6 run tests/load/group-orchestration.js
k6 run tests/load/stream-stability.js
```

## Project Structure

`Phase A` work should stay within these boundaries:

- `apps/api`
  Direct message submission, conversation validation, and dispatch triggers.
- `apps/worker`
  Real provider routing, orchestration execution, retries, and stream event
  emission.
- `packages/agent-sdk`
  Shared execution contract. No provider-specific runtime logic should leak out
  of adapters.
- `packages/agent-adapters`
  Provider-specific request shaping and stream normalization.
- `tests/integration`
  Runtime behavior checks for provider selection, pinned context, and error
  mapping.
- `tests/e2e`
  Browser and provider acceptance checks for the supported baseline.
- `docs/operations`
  Acceptance docs and checklists aligned to the milestone.
- `ai/specs`, `ai/plans`, `ai/tasks`, `ai/logs`
  Traceable planning and execution evidence.

## Code Style

The implementation style for the upcoming code phase should stay boring and
contract-first:

```ts
export interface AgentAdapterFactory {
  create(provider: AgentProvider): AgentAdapter;
}

export function createAgentAdapter(provider: AgentProvider): AgentAdapter {
  switch (provider) {
    case "hermes":
      return new HermesAdapter();
    case "openclaw":
      return new OpenClawAdapter();
    default:
      throw new UnsupportedProviderError(provider);
  }
}
```

Conventions:

- Prefer explicit provider routing over generic plugin magic.
- Keep runtime selection in one factory boundary instead of scattering `if`
  chains across API and worker code.
- Treat `mock` as a test transport, not as the default production path.
- Do not slip `Codex`, `Claude Code`, or Morph Hermes transport work into
  `Phase A` diffs.

## Testing Strategy

`Phase A` verifies three layers:

1. Unit and contract coverage
   - Adapter tests stay responsible for provider-specific protocol parsing.
2. Integration coverage
   - API and worker tests prove that direct and group runtime paths select real
     adapters for `Hermes` and `OpenClaw` instead of falling back to mock-only
     execution.
3. End-to-end coverage
   - Existing browser chat flows and provider acceptance specs are reused, but
     they must now validate the real runtime path for the supported baseline.

Out of scope for `Phase A` verification:

- four-provider staging acceptance
- formal load-test thresholds
- Morph Hermes transport support

## Boundaries

- Always:
  - Keep the long-term four-provider `SPEC.md` target intact.
  - Record every scope change in `ai/logs`.
  - Verify new milestone docs remain dependency-ordered and testable.
- Ask first:
  - Rewriting the root [SPEC.md](../../SPEC.md)
  - Changing the provider data model
  - Adding a fifth provider enum for Morph Hermes
- Never:
  - Declare Release 1 complete based on `Phase A`
  - Use the Hermes local shim as production runtime design
  - Hide deferred scope inside vague "later hardening" notes

## Success Criteria

`Phase A` is complete when all of the following are true:

1. The repo has an explicit milestone spec, plan, and task file for
   `Hermes + OpenClaw Baseline`.
2. The direct conversation runtime no longer rejects supported real providers
   purely because they are not `mock`.
3. Worker execution routes `Hermes` and `OpenClaw` through a real adapter
   factory instead of hardcoded mock adapters.
4. Core acceptance covers:
   - direct chat
   - group orchestration
   - pinned context replay
   - normalized streaming events
   - minimal BYOK setup for `Hermes` and `OpenClaw`
5. Delivery evidence exists for the baseline:
   - runnable demo proof
   - milestone-aligned acceptance docs
   - demo-video TODO explicitly tracked if still open

## Deferred Scope After Phase A

These items remain important, but they are not part of this milestone:

- Real runtime integration for `Codex`
- Real runtime integration for `Claude Code`
- `morph-labs/hermes-agent-fork` integration
- Four-provider staging acceptance
- Full `k6` load-test evidence
- Final Release 1 sign-off

## Open Questions

1. After `Phase A`, should the next milestone be "full four-provider Release 1"
   or "Morph Hermes transport evaluation"?
2. Should the root release checklist eventually be split into:
   - milestone checklist
   - final Release 1 checklist
3. When the real runtime path lands, should `mock` remain available behind a
   test-only switch or stay as an internal adapter only?
