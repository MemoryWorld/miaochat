# Phase C Internal Runtime Registry

## Objective

Phase C no longer lets the product shell speak in raw provider terms. The
customer sees `AI 同事`, `编码工作流`, `审批`, and `任务状态`; the runtime stack
now resolves those product concepts to an internal backend registry.

## Runtime Backends

The shared contract lives in
[`packages/contracts/src/coding-workflow.ts`](../../packages/contracts/src/coding-workflow.ts)
and defines:

- `enhanced-hermes`
- `hermes-compat`
- `openclaw-compat`
- `claude-code-internal`
- `mock`

Only the first three are executable today.

## Preferred Path

### `enhanced-hermes`

This is the preferred built-in backend for coding teammates.

- Product meaning: default runtime for `技术负责人 / 软件工程师 / 代码评审 / 测试工程师`
- Current execution bridge: worker resolves it to the Hermes-compatible transport
- Integration intent: point the Hermes-compatible transport at the
  `morph-labs/hermes-agent-fork` API server path rather than the old CLI shim

The worker-side registry is implemented in
[`apps/worker/src/activities/internal-runtime-registry.ts`](../../apps/worker/src/activities/internal-runtime-registry.ts).

## Compatibility Backends

### `hermes-compat`

- Kept for explicit compatibility with older Hermes-shaped transport paths
- Resolves to provider transport `hermes`

### `openclaw-compat`

- Fallback when a workspace only has a valid OpenClaw credential
- Resolves to provider transport `openclaw`

## Worker Execution Boundary

Built-in coding workflow stages now execute through:

`coding workflow decision -> api dispatch -> Temporal workflow -> internal runtime registry -> provider transport`

The concrete worker entry is
[`internalRuntimeAgentWorkflow`](../../apps/worker/src/workflows/internal-runtime-agent.workflow.ts),
which calls
[`executeInternalRuntimeAgentActivity`](../../apps/worker/src/activities/internal-runtime-agent.activity.ts).

This is what keeps provider names out of the normal shell while preserving the
existing Phase A runtime substrate.

## Claude Internal Contract

`claude-code-internal` is now a first-class contract entry, but **not an
implementation path yet**.

Current behavior:

- the contract enum exists
- the worker registry recognizes the backend name
- execution throws a clear blocked error until the prior Claude source tree is supplied

This preserves the product and API surface without pretending the runtime is
ready.
