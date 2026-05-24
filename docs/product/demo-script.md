# Demo Script

## Objective

Deliver a `3` minute product demo that proves the Release 1 web experience and
shows the multi-agent coordination story clearly.

## Pre-Demo Setup

- Staging web and API are reachable
- At least one working credential is bound for each provider that will be shown
- One direct conversation and one group conversation are pre-seeded as backup
- Artifact preview and deploy-status examples are available in existing
  conversations in case live generation is slow

## Timeline

### 0:00-0:25 — Product Framing

- Introduce Miaochat as a multi-agent collaboration workspace
- Show the conversation list and active workspace selector

### 0:25-0:55 — BYOK Setup

- Open `/setup`
- Select one provider
- Validate and bind a credential
- Call out that the same setup flow exists across providers

### 0:55-1:35 — Direct Conversation

- Create a new direct conversation
- Send a prompt
- Show streaming output and persisted history after refresh

### 1:35-2:15 — Group Orchestration

- Open a group conversation
- Mention or select multiple agents
- Show partial progress / failure visibility and the aggregated result

### 2:15-2:45 — Artifact Review

- Open an attachment, preview, diff, or deploy-status card
- Show how review stays inside the chat timeline

### 2:45-3:00 — Close

- Summarize provider breadth, orchestration, and artifact visibility
- Mention deferred platform surfaces: desktop, mobile, deeper deploy workflows

## Recording Notes

- Prefer one continuous take with browser zoom set so the left rail and main
  timeline are both readable
- If live provider latency is unstable, keep a pre-seeded conversation ready
  and narrate that the same flow was already exercised in acceptance tests
- Keep terminal footage out of frame unless explicitly showing provider or
  staging evidence
