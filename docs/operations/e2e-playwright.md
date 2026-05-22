# Playwright E2E

The browser e2e entrypoint is now `Playwright`.

## Commands

- Browser suite: `pnpm test:e2e`
- Existing in-process smoke suite: `pnpm test:e2e:smoke`
- Real-provider adapter acceptance only: `pnpm test:e2e:providers`

## Coverage Shape

- `tests/e2e-playwright/` runs the browser suite against the real `apps/web`
  Next.js app.
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

The existing jsdom specs are intentionally kept as smoke tests so fast,
in-process regression checks remain available during feature work.
