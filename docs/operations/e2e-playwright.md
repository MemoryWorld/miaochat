# Playwright E2E

The browser e2e entrypoint is now `Playwright`.

## Commands

- Browser suite: `pnpm test:e2e`
- Staging browser BYOK suite: `pnpm test:e2e:byok:staging`
- Staging preflight check: `pnpm staging:preflight`
- Existing in-process smoke suite: `pnpm test:e2e:smoke`
- Real-provider adapter acceptance only: `pnpm test:e2e:providers`

## Coverage Shape

- `tests/e2e-playwright/` runs the browser suite against the real `apps/web`
  Next.js app.
- `tests/e2e-playwright-staging/` runs a staging-only browser suite directly
  against the deployed web surface and real API credentials.
- Network requests to `http://localhost:3001` are intercepted per test so the
  browser covers the same scenarios that previously lived only in
  `tests/e2e/*.spec.tsx`.
- Component-only flows that do not naturally live on a top-level page use the
  lightweight `apps/web/src/app/e2e/[scenario]/page.tsx` harness route.

## Local Run

Install the Playwright browser once:

```bash
pnpm exec playwright install chromium
```

Then run:

```bash
pnpm test:e2e
```

For the staging `/setup` flow against a deployed web surface:

```bash
pnpm staging:preflight

AGENTHUB_WEB_BASE_URL=https://web.example.invalid \
AGENTHUB_API_BASE_URL=https://api.example.invalid \
HERMES_E2E_ACCOUNT_ID=acct_hermes \
HERMES_E2E_SECRET=hermes_demo_secret \
OPENCLAW_E2E_ACCOUNT_ID=acct_openclaw \
OPENCLAW_E2E_SECRET=openclaw_demo_secret \
CODEX_E2E_ACCOUNT_ID=acct_codex \
CODEX_E2E_SECRET=sk-demo \
CLAUDE_CODE_E2E_ACCOUNT_ID=acct_claude \
CLAUDE_CODE_E2E_SECRET=sk-ant-demo \
pnpm test:e2e:byok:staging
```

The preflight command checks whether the GitHub `staging` environment exists,
whether `.github/workflows/staging-provider-acceptance.yml` is published on the
default branch, and which staging secrets are still missing.

The existing jsdom specs are intentionally kept as smoke tests so fast,
in-process regression checks remain available during feature work.
