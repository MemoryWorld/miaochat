# Local Demo Runbook

## Objective

Produce a repeatable local demo path for the current AI 同事 workspace without
depending on staging-only infrastructure.

## Prerequisites

- Root `.env` or shell exports include the standard local development values.
- Optional demo-user overrides:
  - `MIAOCHAT_DEMO_EMAIL`
  - `MIAOCHAT_DEMO_PASSWORD`
- A DeepSeek API Key is available for real model-connection testing.

## Startup Sequence

1. Start local infra:

```bash
docker compose -f infra/docker/compose.dev.yml up -d postgres pgbouncer redis temporal minio
```

2. Run migrations:

```bash
pnpm db:migrate
```

3. Start the apps:

```bash
pnpm --filter api dev
pnpm --filter worker dev
pnpm --filter web dev
```

4. Open the web app, sign in, and go to `设置 > 模型连接`.

5. Add and validate the DeepSeek connection.

6. Return to `工作台`, choose `编码`, and start a workflow.

## Recording Path

Recommended order:

1. Product framing and workspace shell.
2. Model connection walkthrough.
3. Recommended AI 同事 selection.
4. Plan approval.
5. Execution, review, and testing timeline.
6. Inbox, tasks, calendar, and channel overview.

## Backup Strategy

- If live model latency is unstable, use existing seeded timeline evidence.
- If the model connection fails, show the connection error and recovery path
  instead of hiding the failure.
