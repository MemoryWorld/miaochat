# Phase D Route Family Map

## Purpose

This document freezes the route-family model for the `Phase D` workspace shell.

The implementation may use Next.js app routes instead of hash routes, but the
information architecture must preserve these families.

## Primary Routes

### Workspace Shell

- `/`
- `/inbox`
- `/tasks`
- `/calendar`
- `/channels/:channelId`
- `/settings`

### AI Teammates

- `/teammates`
- `/teammates/new`
- `/teammates/:teammateId`

### Teammate Tabs

- `/teammates/:teammateId?tab=chat`
- `/teammates/:teammateId?tab=tasks`
- `/teammates/:teammateId?tab=activity`
- `/teammates/:teammateId?tab=calendar`
- `/teammates/:teammateId?tab=channels`
- `/teammates/:teammateId?tab=files`
- `/teammates/:teammateId?tab=skills`
- `/teammates/:teammateId?tab=memory`
- `/teammates/:teammateId?tab=settings`

### Channel Tabs

- `/channels/:channelId?tab=chat`
- `/channels/:channelId?tab=files`

### Settings Sections

- `/settings?section=profile`
- `/settings?section=workspace`
- `/settings?section=members`
- `/settings?section=credentials`
- `/settings?section=billing`
- `/settings?section=marketplaces`

## Compatibility Routes

These routes remain valid during migration, but they are no longer the primary
product story:

- `/agents`
- `/setup`

## Navigation Groups

The persistent shell groups links into:

- 工作台
- 协作
- 管理

## Route Ownership

- `收件箱`, `任务`, `日历` are shared page families with different scopes.
- `频道` owns timeline plus files.
- `AI 同事` owns the actor shell.
- `设置` owns advanced admin flows including credentials.
