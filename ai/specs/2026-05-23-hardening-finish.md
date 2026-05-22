# Spec: Hardening Track Finish (`H-07` to `H-10`)

## Objective

Finish the remaining hardening-track work in the post-Release-1 roadmap without
regressing the existing Release 1 web and API acceptance surface.

This slice covers:

- `H-07`: adopt Tailwind CSS and a shadcn-style baseline in `apps/web`
- `H-08`: move browser e2e coverage from vitest+jsdom to Playwright while
  keeping the current jsdom files as smoke tests
- `H-09`: add Supertest API contract coverage for critical authenticated
  boundaries
- `H-10`: add a staging-only provider acceptance + load-test pipeline and
  update the release evidence documents

## Tech Stack

- `Next.js 15` app router web client
- `React 19`
- `NestJS` API
- `Vitest` for unit/integration and contract coverage
- `Playwright` for browser e2e
- `Tailwind CSS` with CSS variables for design tokens
- `k6` for staging-only load validation

## Commands

- Install: `pnpm install`
- Web build: `pnpm --filter web build`
- Web tests: `pnpm --filter web test`
- API tests: `DATABASE_URL=postgres://agenthub:agenthub@localhost:6432/agenthub_h05_test pnpm --filter api test`
- Integration tests: `DATABASE_URL=postgres://agenthub:agenthub@localhost:6432/agenthub_h05_test pnpm test:integration`
- Browser e2e: `pnpm test:e2e`
- Browser smoke tests: `pnpm test:e2e:smoke`
- Real-provider acceptance only: `pnpm test:e2e:providers`
- Staging pipeline local entrypoint: `pnpm test:e2e:staging`

## Project Structure

- `apps/web/` → Next.js web client, Tailwind config, browser harness pages
- `apps/api/test/` → Supertest contract tests
- `tests/e2e/` → existing Vitest smoke tests and real-provider specs
- `tests/e2e-playwright/` → Playwright browser coverage
- `tests/load/` → k6 staging scenarios
- `docs/operations/` → release evidence and operational runbooks
- `.github/workflows/` → staging-only CI pipeline

## Code Style

Prefer small UI primitives and utility classes over inline `style` objects for
newly touched web surfaces.

```tsx
<button
  className={cn(
    "inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-semibold",
    disabled
      ? "cursor-not-allowed bg-slate-400 text-white"
      : "bg-slate-950 text-white hover:bg-slate-800"
  )}
  disabled={disabled}
  type="submit"
>
  Save and bind
</button>
```

## Testing Strategy

- `H-07`: prove the migration with `pnpm --filter web build` and
  `pnpm --filter web test`
- `H-08`: run browser e2e with Playwright; keep `tests/e2e/*.spec.tsx` under a
  smoke-test script so the existing in-process coverage remains available
- `H-09`: cover auth, workspaces, messages, artifacts, and credentials via
  Supertest in `apps/api/test/*.contract-spec.ts`
- `H-10`: add a staging-only script/workflow that runs the real-provider specs
  and the k6 scenarios when staging secrets are present

## Boundaries

- Always:
  - Preserve existing user-visible labels and accessible names so current tests
    remain meaningful.
  - Prefer fetch interception and browser-side harnessing over test-only app
    behavior changes.
  - Record any verification that requires external staging credentials in the
    operations docs.
- Ask first:
  - Changing provider API contracts
  - Rewriting the existing e2e scenarios instead of porting them
- Never:
  - Remove the existing jsdom smoke tests
  - Commit secrets or fake staging evidence
  - Mark an external acceptance run as locally verified when credentials are not
    available

## Success Criteria

- Tailwind is configured in `apps/web`, shared tokens live in `globals.css`,
  and the main web shell / setup / agents UI uses utility-class-based styling.
- `pnpm test:e2e` runs Playwright browser tests instead of vitest jsdom.
- Existing `tests/e2e/*.spec.tsx` files remain runnable through a dedicated
  smoke-test script.
- Supertest contract specs pass for auth, workspaces, messages, artifacts, and
  credentials.
- A staging-only workflow/script exists for real-provider acceptance plus k6
  load tests, and the release evidence docs explicitly record the current
  verification status.

## Open Questions

- Local development does not currently expose staging provider credentials, so
  `H-10` can only be fully executed by a secrets-backed staging runner.
