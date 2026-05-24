# Staging Acceptance Tooling Slice

## Scope

- Close the remaining repo-side gaps that were blocking Release 1 staging
  acceptance setup.
- Make the missing GitHub/environment prerequisites explicit and repeatable.
- Add a repeatable way to generate `AGENTHUB_LOAD_*` ids without manual API
  clicking.

## What Landed

- Added `pnpm staging:preflight` backed by
  `scripts/staging/check-acceptance-preflight.ts`.
  It detects:
  - whether the GitHub `staging` environment exists
  - whether `staging-provider-acceptance.yml` is present on the default branch
  - which staging secrets are still missing
- Added `pnpm staging:seed-load` backed by
  `scripts/staging/seed-load-test-data.ts`.
  It signs up a throwaway user, creates three mock custom agents, creates
  direct/group/stream conversations, and prints export-ready
  `AGENTHUB_LOAD_*` values.
- Updated the staging-facing operations docs to include the new preflight and
  load-data generation commands.
- Created the GitHub `staging` environment in `MemoryWorld/miaochat`.

## Verification

- `pnpm exec vitest run tests/staging-support.spec.ts tests/seed-load-test-data.spec.ts`
- `pnpm staging:preflight`
  - result: blocked, because the workflow is not yet on the default branch and
    25 staging secrets are still unset
- `AGENTHUB_API_BASE_URL=http://localhost:3001 pnpm staging:seed-load`
  - result: pass, produced export-ready direct/group/stream conversation ids

## Residual Risk

- Formal staging acceptance is still blocked by remote state:
  the workflow must be merged to the default branch and the 25 required staging
  secrets must be populated.
- `Codex` / `Claude Code` runtime acceptance and browser BYOK acceptance still
  require real staging credentials; this slice only removed the repo-side setup
  gaps.
