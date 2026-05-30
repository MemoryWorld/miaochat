# Phase E AI Teammate Acceptance

## Public Vocabulary Inventory

Customer-visible surfaces must use:

- `AI 同事`
- `模型连接`
- `工作区`
- `频道`
- `任务`
- `审批`
- `能力`
- `记忆`

## Leakage Inventory

| Area | Current Rule | Status |
|---|---|---|
| Web daily-use pages | Do not expose backend names or execution jargon | must remove now |
| Settings setup path | Use `模型连接`; DeepSeek is the only visible connection option | must remove now |
| Teammate creation | Use templates, memory, approval, tools, model preference, output style | must remove now |
| Product docs | Explain user workflow, not implementation identity | must remove now |
| Internal tests and architecture notes | May mention hidden implementation only when needed for maintainers | internal only |
| Original requirements archive | Historical source material, not a customer-facing page | internal only |

## DeepSeek Connection Acceptance

1. Open `设置 > 模型连接`.
2. Enter a label, model name, API Key, and default preference.
3. Click `验证连接`.
4. The API calls the live DeepSeek-compatible chat completions endpoint.
5. A successful validation enables `保存并启用`.
6. Reload settings and confirm the saved connection keeps label, model, status,
   and preference.
7. Start a coding workflow and confirm it resolves the active workspace
   connection.

## Coding Workflow Acceptance

Completion requires this sequence:

1. User starts `编码`.
2. User keeps at least one AI 同事.
3. The planning teammate writes a plan.
4. User approves the plan.
5. Execution teammates write timeline updates.
6. Review and testing updates are persisted.
7. Channel refresh preserves the timeline.
8. Failed activity exposes recovery actions.

## Visual Acceptance

- Logged-in pages use a compact shell.
- The left navigation has concise labels.
- The active workspace pill never overflows.
- Inbox, tasks, calendar, channels, settings, and teammate creation each expose
  one obvious primary action.
- Channel tab changes preserve the same channel and workspace context.
