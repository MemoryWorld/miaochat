# Product Design

## Product Summary

Miaochat is an IM-shaped AI teammate workspace. Users choose what they want to
do, select or customize AI 同事, approve important plans, and keep execution
history, files, tasks, calendar events, and recovery actions inside the same
workspace.

The product goal is not another chat box. It is a coordination surface where AI
同事 can plan, execute, review, and verify work while the user keeps control at
key decision points.

## Target Users

- Individual builders who want one place to manage coding work with AI 同事.
- Small teams that need shared visibility into AI-assisted planning and
  execution.
- Power users who want custom AI teammates without learning internal execution
  details.

## Core User Flows

### 1. Model Connection

- User opens settings.
- User adds a DeepSeek model connection.
- The app validates the key with the model service.
- The connection becomes available to AI 同事 inside the active workspace.

### 2. Coding Work Mode

- User chooses `编码`.
- The system recommends a teammate set.
- The user can remove or customize teammates.
- A plan is submitted first and waits for approval before execution.

### 3. Workspace Timeline

- AI 同事 write updates into the channel timeline.
- Failures expose retry, details, model connection, and recovery-task actions.
- History persists after refresh.

### 4. Operational Tools

- Inbox handles approvals, mentions, failures, tasks, calendar updates, and
  connection alerts.
- Tasks support search, filters, list, and board views.
- Calendar supports month, week, and day views.
- Channels support search, filters, sorting, and shortcut actions.

## Product Principles

- Workspace-first: every action belongs to the active workspace.
- AI-teammate language: users interact with role names and responsibilities.
- Plan-before-execution: risky work waits for user approval.
- Failure-explicit: failed activity must be recoverable.
- Secret-safe: API Keys are accepted in settings and never shown again.

## Current Surface

- Web workspace shell.
- Model connection settings.
- Coding work mode with recommended AI 同事.
- Channel timeline and recovery actions.
- Inbox, tasks, calendar, channels, members, billing, and capability management
  skeletons.

## Success Criteria

- A user can add a DeepSeek connection.
- A user can launch a coding workflow with selected AI 同事.
- The workflow produces plan, approval, execution, review, and test evidence.
- Core workspace pages expose real actions rather than product explanation.
