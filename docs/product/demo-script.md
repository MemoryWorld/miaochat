# Demo Script

## Objective

Deliver a `3` minute Chinese product demo that shows Miaochat as a workspace
where users connect a model, choose AI 同事, and complete one coding workflow in
a single timeline.

## Pre-Demo Setup

- Local web, API, worker, and database are reachable.
- A demo user can log in.
- The active workspace has one valid DeepSeek model connection.
- The coding work mode has at least one AI 同事 selected.
- A recovery path is ready if live model latency is unstable.

## Timeline

### 0:00-0:25 — Workspace Framing

- Show the compact workspace shell.
- Show the active workspace selector.
- Explain that the user works with AI 同事, not with backend tools.

### 0:25-0:55 — Model Connection

- Open settings.
- Show `模型连接`.
- Validate or show an already-saved DeepSeek connection.
- State that the API Key is stored server-side and is never displayed again.

### 0:55-1:35 — Coding Work Mode

- Open the workbench.
- Choose `编码`.
- Review the recommended AI 同事 set.
- Remove or keep teammates as needed, then start the work.

### 1:35-2:20 — Plan, Approval, Execution

- Show the technical lead submitting a plan first.
- Approve the plan.
- Show implementation, review, and testing updates in the same timeline.
- If a model call fails, show retry, details, model connection, and recovery
  task actions.

### 2:20-2:45 — Workspace Tools

- Open inbox, tasks, calendar, and channels briefly.
- Show filters, primary actions, and context continuity.

### 2:45-3:00 — Close

- Summarize the closed loop: connect model, select AI 同事, approve plan, execute,
  review, and verify.
- Mention that future model options can be added without changing the customer
  workflow.

## Recording Notes

- Use Chinese copy in the browser.
- Keep terminal output out of frame unless showing a verification command.
- If live execution stalls, use seeded timeline evidence and state that the same
  flow is covered by integration tests.
