# Agents Page Auth And Data-Shape Bug

## Date

`2026-05-28`

## Scope

- Investigate and fix the `/agents` runtime crash:
  `TypeError: agents.map is not a function`
- Record the root cause, the missing guardrail, and the prevention rule.

## Skills Used

- `using-agent-skills`
- `编程技能包`
- `debugging-and-error-recovery`
- `test-driven-development`
- `documentation-and-adrs`

## Why This Log Exists

The relevant "record the bug and stop it happening again" workflow inside the
skill pack is:

- `debugging-and-error-recovery`: preserve evidence, localize, reduce, fix the
  root cause, add recurrence guards
- `documentation-and-adrs`: record the decision, the context, and the
  prevention rule in-repo

This file is the durable record for that workflow.

## Reproduction Evidence

Observed in the browser on `/agents`:

```text
Runtime TypeError
agents.map is not a function
at AgentList (src/features/agents/agent-list.tsx:20:15)
at AgentsPage (src/app/agents/page.tsx:110:11)
```

## Root Cause

The bug was caused by two failures working together:

1. `AgentsPage` loaded `/custom-agents` using cross-origin `fetch(...)` without
   `credentials: "include"`.
2. When the API rejected the request because the session cookie was not sent,
   the page still parsed the JSON error object and stored it directly in the
   `agents` state as if it were `CustomAgent[]`.

`AgentList` correctly assumes `agents` is an array and immediately calls
`agents.map(...)`, so the page crashed when the error object reached the list.

## Why It Happened

- The page duplicated request logic instead of reusing the safer pattern
  already used in `chat-experience.tsx`.
- The page trusted `response.json()` to match the happy-path shape.
- The initial test only covered successful list/create flows and never covered:
  - missing credentials
  - non-OK responses
  - non-array payloads

## Fix Landed

Files changed:

- [apps/web/src/app/agents/page.tsx](../../apps/web/src/app/agents/page.tsx)
- [apps/web/src/app/agents/page.spec.tsx](../../apps/web/src/app/agents/page.spec.tsx)

Behavior changes:

- all `/custom-agents` page requests now send `credentials: "include"`
- initial list load now checks `response.ok`
- the page reads JSON defensively
- only array payloads are passed into `setAgents`
- API error payloads are surfaced as user-visible error text instead of causing
  a render crash

## Regression Guard

Added a regression test that verifies:

1. the initial `/custom-agents` request includes credentials
2. an auth failure renders the API error message instead of crashing the page

## Prevention Rule

For every browser-side request from `apps/web` to `apps/api`:

1. If the request depends on session auth, always send
   `credentials: "include"`.
2. Never cast `response.json()` straight to the happy-path type.
3. Gate state updates behind:
   - `response.ok`
   - shape guards such as `Array.isArray(...)`
4. Every new page-level data loader needs one negative-path test, not only a
   success-path test.

## Verification

- `pnpm --filter web exec vitest run src/app/agents/page.spec.tsx`
- `pnpm --filter web exec eslint src/app/agents/page.tsx src/app/agents/page.spec.tsx`
- `pnpm --filter web test`
- `pnpm --filter web build`
