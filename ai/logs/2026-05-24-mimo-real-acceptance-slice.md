# MiMo Real Acceptance Slice

## Scope

- Record the reported `2026-05-24` live-upstream acceptance slice for
  `Hermes` and `OpenClaw` via Xiaomi MiMo local shims.
- Wire the repo so the remaining formal acceptance work can run through a
  staging browser BYOK suite plus the existing staging provider/k6 pipeline.

## What Landed

- Added a staging-only Playwright BYOK suite under
  `tests/e2e-playwright-staging/` plus a dedicated config
  `playwright.staging.config.ts`.
- Extended `tests/e2e/real-provider-test-support.ts` with explicit browser BYOK
  environment requirements and per-provider credential lookup helpers.
- Updated `tests/e2e/staging-runner.ts`, `package.json`, and the GitHub Actions
  workflow so the staging pipeline now runs:
  `pnpm test:e2e:byok:staging` → `pnpm test:e2e:providers` → the four `k6`
  scenarios.
- Updated provider-acceptance and release-checklist docs to distinguish:
  - reported live Xiaomi MiMo shim evidence for `Hermes` / `OpenClaw`
  - pending real-upstream staging work for `Codex` / `Claude Code`
  - pending browser-driven BYOK acceptance for all four providers

## Verification

- Reported local evidence from `progress.md` for:
  - `pnpm shim:openclaw`
  - `pnpm shim:hermes`
  - `AGENTHUB_REAL_PROVIDER_MODE=staging ... vitest run tests/e2e/openclaw-real.spec.ts tests/e2e/hermes-real.spec.ts`
- `pnpm exec vitest run tests/real-provider-test-support.spec.ts`
- `AGENTHUB_STAGING_DRY_RUN=1 pnpm test:e2e:staging`
- `AGENTHUB_WEB_BASE_URL=https://web.example.invalid AGENTHUB_API_BASE_URL=https://api.example.invalid ... pnpm exec playwright test --config playwright.staging.config.ts --list`
- `pnpm exec tsc --noEmit -p apps/web/tsconfig.json`

## Residual Risk

- `Codex` and `Claude Code` still need a committed real-upstream staging pass.
- The new browser BYOK suite and the staging runner require secrets-backed CI
  plus a deployed staging web URL before they can produce formal acceptance
  evidence.
- The Xiaomi MiMo shim evidence for `Hermes` and `OpenClaw` was reported by a
  separate local slice and has not been re-run in this turn.
