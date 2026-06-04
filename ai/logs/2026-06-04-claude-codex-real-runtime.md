# 2026-06-04 Claude Code And Codex Real Runtime Wiring

## Context

The original competition requirements explicitly mention mainstream coding
agents such as Claude Code and Codex. A provider enum plus fake HTTP endpoints
is not enough for a defensible handoff, so this slice replaces those placeholders
with official execution surfaces.

## Decisions

- Claude Code now targets the official `@anthropic-ai/claude-agent-sdk`
  `query()` interface.
- Codex now targets the official `codex exec --json` non-interactive CLI path.
- Provider credentials are resolved by the worker and injected only into the
  child SDK/CLI environment for the single run.
- The worker runtime gate now allows `claude-code` and `codex` providers through
  the same BYOK credential resolver used by other real providers.
- Claude Code and Codex runs capture tracked-file `git diff` output plus
  synthetic `/dev/null` new-file diffs for untracked files from the configured
  runtime workspace, then return the result as a runtime `diff` artifact.
- The API persists runtime `diff` artifacts as `kind: "diff"` with
  `text/x-diff` content.
- Real-provider e2e specs for Claude Code and Codex are skipped unless staging
  mode and real secrets are present. Local unit tests use injected runners only
  to verify Miaochat parsing and normalization logic.

## Follow-Up Boundary

This slice proves real SDK/CLI execution wiring plus diff capture including
tracked edits and untracked new files. Product-level workspace mapping, isolated
git worktrees per run, binary/new-file size policy, and max-output operational
tuning should be the next hardening step before calling the integration production ready.
