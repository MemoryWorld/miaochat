# 2026-06-04 Original Requirements Closeout

## Context

The user asked to continue fixing the 7 old scenarios, compare against `original-requirements`, upload a git checkpoint after each comparison, and stop once everything except the 3 minute demo video is complete. The remote Codex sidecar was instructed to SSH into `5090`, read `/home/torch/.codex/skills/programming-skill-pack/SKILL.md`, and use the programming skill pack while reviewing the remaining issues.

## Findings

- The 7 failing Playwright scenarios were not product regressions. Their mocks still targeted `http://localhost:3001/**`, while the web app now calls the Next `/api/**` proxy.
- The Heavy Agent harness also used old English labels after the AI colleague UI was localized to Chinese.
- `original-requirements` deliverables are present except for the human-recorded 3 minute demo video.
- Formal staging, real DeepSeek key acceptance, and full k6 capacity evidence remain release gates, not original competition deliverables.

## Changes

- Updated `tests/e2e-playwright/harness.spec.ts` to intercept `/api/**` routes and compare normalized API paths.
- Updated the old Heavy Agent Playwright flow to use `AI 同事名称`, `职责说明`, `添加能力`, and `创建 AI 同事`.
- Added `docs/product/original-requirements-coverage.md` as the source-of-truth checklist for the original competition requirements.

## Verification

- `./node_modules/.bin/playwright test tests/e2e-playwright/harness.spec.ts` -> 10 passed.
- Focused Vitest suite for message actions, artifact/diff/deploy paths, chat experience, channels, and demo seed/check -> 28 passed.
- Focused ESLint command for changed web/test files -> passed.
- `./node_modules/.bin/tsc -p apps/web/tsconfig.json --noEmit --pretty false` -> passed.
