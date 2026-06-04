# 2026-06-04 Agent Runtime Hardening

## Context

The user asked whether Miaochat's coding agents can avoid dangerous shell usage
such as `rm -rf`, how sandboxing works, how context is managed, whether task
state survives interruptions, how overlong context is handled, and how traces are
recorded. The remote 5090 implementation followed the local programming skill
pack workflow: security hardening, TDD, incremental implementation, and context
engineering.

## Completed Changes

- Added a workspace sandbox for Claude Code and Codex runs. Real coding-agent
  execution now runs in an isolated temporary git worktree by default, falls back
  to a filesystem copy sandbox when needed, captures tracked and untracked diffs,
  and cleans up after the run.
- Added an OS/container sandbox readiness gate. `MIAOCHAT_AGENT_OS_SANDBOX=required`
  now fails closed when Docker or Podman is unavailable; `preferred` records
  fallback metadata instead of pretending full OS isolation happened.
- Added a command policy guard in `tool-runtime` and the desktop agent supervisor.
  Dangerous commands and shell forms such as destructive delete, privilege
  escalation, filesystem formatting, and remote install pipelines are rejected
  before execution.
- Compacted pinned harness context so long-term pinned material is retained under
  a bounded prompt budget instead of being naively appended forever.
- Added trace timeline events. API and worker spans can now record named events,
  logs, metrics, and OpenTelemetry span events such as `provider.runtime_ready`,
  `context.compiled`, and `provider.execution_completed`.
- Added persistent agent run ledger checkpoints. Dispatch now writes
  `running/context_prepared`, completion writes `completed`, and failures write
  `failed` with error metadata.
- Exposed run state through `GET /channels/:channelId/agent-runs`, with a typed
  contract schema and API contract coverage.

## Current Answer For Reviewers

- Sandbox: Miaochat now has real workspace isolation for code-producing agents
  and a fail-closed Docker/Podman readiness gate. Full provider execution inside
  a container is a follow-up production hardening step; the app does not falsely
  claim that container isolation has already happened.
- Dangerous commands: high-risk commands are blocked by policy before tool or
  supervisor execution. Provider code edits are also captured as diff artifacts
  from isolated workspaces rather than directly mutating the source repository.
- Context management: each turn receives assembled recent channel context plus
  pinned context, with compaction for pinned material. Completed turns persist a
  context snapshot id, rendered prompt hash, preview, source refs, and token
  estimate for audit.
- Overlong context: the current implemented mitigation is deterministic budgeted
  compaction for pinned context and bounded source refs. Semantic retrieval and
  procedural-memory ranking remain planned improvements documented in
  `docs/agent harnessdesign/04-context-memory-state.md`.
- Task state and interruption: agent runs now leave durable DB checkpoints before
  provider execution and after failure/completion. If the process dies mid-run,
  operators and the UI/API can see stale `running` rows via `/agent-runs`; fully
  automatic resume/retry orchestration is still a production follow-up.
- Trace: traces are recorded through `TraceRecorder` spans. Timeline events are
