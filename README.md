# Miaochat

Miaochat 是一个以工作区为中心的 AI 同事协作平台。用户先连接模型，再选择或创建 AI 同事，之后在频道时间线里完成计划、审批、执行、评审和验证。

当前可运行主线已经收敛为：

- 中文优先的 Web 工作区
- `DeepSeek` 模型连接
- 编码工作模式
- 推荐 AI 同事组合和自定义 AI 同事
- 频道、任务、日历、收件箱、设置等工作区页面
- 频道内邀请真实同事、权限控制、成员提及、未读状态、线程回复、反应、附件和 AI 同事调度过滤

## 1. 运行要求

- `Node.js >= 22`
- `pnpm >= 10`
- `Docker` + `docker compose`

## 2. 快速开始

### 2.1 安装依赖

```bash
pnpm install
```

### 2.2 准备环境变量

```bash
cp .env.example .env
```

`api` 和 `worker` 直接读取当前 shell 环境变量。每个启动服务的终端都建议执行：

```bash
set -a
source .env
set +a
```

Web 端本地环境：

```bash
cp apps/web/.env.example apps/web/.env.local
```

### 2.3 启动基础设施

```bash
docker compose -f infra/docker/compose.dev.yml up -d postgres pgbouncer redis temporal minio
```

### 2.4 初始化数据库

```bash
pnpm db:migrate
```

需要基础数据时：

```bash
pnpm db:seed
```

### 2.5 启动服务

开 3 个终端。

API：

```bash
set -a
source .env
set +a
pnpm --filter api dev
```

Worker：

```bash
set -a
source .env
set +a
pnpm --filter worker dev
```

Web：

```bash
pnpm --filter web dev
```

默认地址：

- Web: `http://localhost:3000`
- API: `http://localhost:3001`

## 3. 登录后怎么用

1. 打开 `http://localhost:3000`。
2. 注册或登录账号。
3. 进入 `设置 > 模型连接`。
4. 添加 DeepSeek API Key，点击 `验证连接`，通过后点击 `保存并启用`。
5. 回到 `工作台`，选择 `编码`。
6. 检查推荐 AI 同事组合，可删除不需要的同事，但至少保留一位。
7. 启动编码工作流，等待计划提交。
8. 审批计划后，AI 同事会继续执行、评审和验证，并把结果写入频道时间线。
9. 在频道右侧 `成员与权限` 中邀请真实同事或邮箱，按需设置 `可发言`/`只读`。
10. 在聊天输入框提及真实同事或 AI 同事，频道会按当前成员列表决定谁可以发言、谁会收到 AI 调度。
11. 在频道里使用回复线程、反应按钮、附件选择和通知偏好，确认协作信息都沉淀在同一条频道时间线里。

## 4. 常用命令

### 开发

```bash
pnpm --filter api dev
pnpm --filter worker dev
pnpm --filter web dev
```

### 构建

```bash
pnpm build
pnpm --filter api build
pnpm --filter worker build
pnpm --filter web build
```

### 测试

```bash
pnpm test
pnpm test:integration
pnpm test:e2e:smoke
```

重点验收：

```bash
pnpm --filter web test
pnpm --filter api build
pnpm exec vitest run tests/integration/deepseek-connection.spec.ts
pnpm exec vitest run tests/integration/coding-workflow-api.spec.ts
pnpm exec vitest run tests/integration/coding-workflow-execution.spec.ts
```

## 5. 当前状态怎么理解

已经打通：

- 模型连接设置和验证
- AI 同事创建与推荐组合
- 编码工作流计划审批
- 频道时间线持久化
- 频道成员与权限列表
- 真实同事邀请和外部邮箱待加入
- 真实同事消息作者展示
- 真人/AI 同事中文提及
- 频道未读数和通知偏好
- 消息线程回复和反应计数
- 消息附件和频道文件页
- AI 同事移除后不再参与频道调度
- 收件箱、任务、日历、频道、设置的操作型页面
- 服务端隐藏执行路由

仍需真实人工验收：

- 使用真实 DeepSeek API Key 完整跑通编码协作闭环
- 录制 3 分钟 Demo 视频
- Staging 环境全量验收
- 正式负载测试结果

## 6. 仓库结构

```text
apps/
  web/      Next.js Web 客户端
  api/      NestJS + Fastify API
  worker/   Temporal worker

packages/
  contracts/        共享 schema 和 DTO
  agent-sdk/        统一执行契约
  agent-adapters/   服务端模型调用适配层
  domain/           领域服务

db/
  migrations/       数据库迁移
  seeds/            基础 seed

docs/
  product/          产品和 demo 文档
  architecture/     架构说明
  operations/       验收、运行、发布文档

ai/
  specs/            版本化 spec
  plans/            实施计划
  tasks/            任务拆解
  logs/             AI 协作记录
```

## 7. 推荐阅读

1. [Phase E Spec](./ai/specs/2026-05-30-phase-e-ai-teammate-productization-and-deepseek-readiness.md)
2. [Phase E Acceptance](./docs/product/phase-e-ai-teammate-acceptance.md)
3. [Model Connection Boundary](./docs/architecture/phase-e-model-connection-runtime-boundary.md)
4. [Local Demo Runbook](./docs/product/phase-a-demo-runbook.md)
5. [Release Checklist](./docs/operations/release-checklist.md)
6. [Phase F Channel Collaboration Runbook](./docs/operations/phase-f-channel-collaboration-runbook.md)

## 8. 停止本地环境

```bash
docker compose -f infra/docker/compose.dev.yml stop postgres pgbouncer redis temporal minio
```

彻底清理容器和卷：

```bash
docker compose -f infra/docker/compose.dev.yml down -v
```
