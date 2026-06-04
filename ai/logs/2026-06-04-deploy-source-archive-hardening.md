# 2026-06-04 Deploy Source Archive Hardening

## Context

After comparing Miaochat against `docs/product/original-requirements.md`, the remaining deploy gap was that the `source-archive` branch only returned a prepared message. The web deploy e2e test was also blocked because `apps/web` imported `clsx` and `tailwind-merge` without declaring them.

## Changes

- Added `clsx` and `tailwind-merge` to `apps/web/package.json` and refreshed `pnpm-lock.yaml`.
- Added `deploySourceArchiveActivity` to turn an artifact `storageKey` into an object-storage download URL.
- Registered the new activity in the worker activity index and Temporal worker options.
- Routed the `source-archive` workflow branch through the activity instead of returning an inline prepared-only result.
- Added activity test coverage for source archive URL generation and missing storage-key fallback.
- Added workflow test coverage for static-site, container, and source-archive routing.
- Updated the original requirements coverage doc with explicit deploy boundaries.

## Boundary

This does not claim real Netlify/S3/Vercel, registry, or Kubernetes deployment. Static-site and container targets remain adapter-level competition demo flows until provider credentials and deployment jobs are wired. Source archive now has a concrete download URL for stored artifacts.

## Verification

- `./node_modules/.bin/vitest run --no-file-parallelism apps/worker/test/deploy-source-archive.activity.spec.ts apps/worker/test/deploy-artifact.workflow.spec.ts apps/web/src/features/chat/deploy-command.spec.tsx tests/e2e/deploy-command.spec.tsx` -> 8 passed.
- `./node_modules/.bin/tsc -p apps/web/tsconfig.json --noEmit --pretty false` -> passed.
- `cd apps/worker && ../../node_modules/.bin/tsc -p tsconfig.build.json --noEmit --pretty false` -> passed.
- Focused ESLint for changed worker/web/test files -> passed.
