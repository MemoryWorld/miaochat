# Product Design

## Product Summary

Miaochat is an IM-shaped multi-agent workspace. Users interact with AI agents
as if they were chat contacts, switching between direct conversations and
group conversations while preserving context, artifacts, and follow-up actions
inside the message timeline.

The product goal is not "one more chat box." It is a coordination surface for
task execution across multiple agent runtimes with explicit artifact review,
context pinning, and operator-visible failure states.

## Target Users

- Individual builders who switch between multiple AI tools during one task
- Small engineering or product teams that want one shared interaction model
  across heterogeneous agent providers
- Power users who need both lightweight saved agents and deeper tool/runtime
  extensibility

## Core User Flows

### 1. Setup And BYOK

- User opens `/setup`
- User selects a provider
- User validates and binds a provider credential
- The credential becomes available for later conversations inside the active
  workspace

### 2. Direct Conversation

- User creates a conversation with a single agent
- The agent streams a response into the timeline
- The user iterates on the task with preserved history and pinned context

### 3. Group Collaboration

- User creates a group conversation or `@` mentions agents
- The orchestrator coordinates sub-agents
- The timeline reflects partial progress, degraded states, and the final
  merged response

### 4. Artifact Review

- Agent responses can include attachments, previews, diffs, and deploy status
  cards
- The user reviews artifacts inline without leaving the conversation

## Product Principles

- Chat-first: conversations are the primary unit of work
- Provider-agnostic: agent adapters normalize runtime differences
- Artifact-visible: outputs must be inspectable in the timeline
- Failure-explicit: orchestration errors are surfaced, not hidden
- Evolutionary scope: Release 1 focuses on the web workflow while preserving
  room for deploy, desktop, mobile, and platform-managed credentials

## Release 1 Surface

- Web chat experience
- Direct and group conversations
- Context pinning
- Lightweight custom agents
- Artifact cards
- BYOK setup flow
- Real-provider acceptance infrastructure

## Deferred Capability Map

- Deploy pipeline and preview URLs: implemented foundation, still gated behind
  acceptance hardening
- Desktop shell and local agent supervision: implemented foundation, not part
  of Release 1 sign-off
- Mobile review and approval shell: implemented foundation, not part of
  Release 1 sign-off
- Rich code editing / version history / fine-grained artifact editing: later
  product phases

## Success Criteria

- A user can bind credentials, start conversations, and get context-aware
  responses from multiple provider families
- Group orchestration is observable and degrades cleanly
- Artifact review happens inside the message timeline
- The repo contains auditable specs, plans, tasks, and release evidence
