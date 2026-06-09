# Miaochat

Miaochat 是一个以工作区为中心的 AI 同事协作平台。用户先连接模型，再选择或创建 AI 同事，之后在频道时间线里完成计划、审批、执行、评审和验证。

当前可运行主线已经收敛为：

- 中文优先的 Web 工作区
- OpenCode-backed 国产模型连接，覆盖 DeepSeek、Qwen、Kimi、GLM、MiniMax 等模型
- 编码工作模式
- 推荐 AI 同事组合和自定义 AI 同事
- 频道、任务、日历、收件箱、设置等工作区页面
- 频道内邀请真实同事、权限控制、成员提及、未读状态、线程回复、反应、附件和 AI 同事调度过滤
- Expo 移动端 MVP：登录、查看会话、审批确认、产物预览
- Electron 桌面端 MVP：嵌入 Web、系统通知、本地文件选择、本地 Agent 进程桥接

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

`api`、`worker` 和部署验收脚本直接读取进程环境变量。推荐用
Node 的 env-file 加载方式运行 pnpm 命令，避免把包含空格或特殊字符
的 token 当作 shell 命令执行：

```bash
node --env-file=.env $(which pnpm) <command>
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
node --env-file=.env $(which pnpm) db:migrate
```

需要基础数据时：

```bash
node --env-file=.env $(which pnpm) db:seed
```

### 2.5 启动服务

开 3 个终端。

API：

```bash
node --env-file=.env $(which pnpm) --filter api dev
```

Worker：

```bash
node --env-file=.env $(which pnpm) --filter worker dev
```

Web：

```bash
pnpm --filter web dev
```

移动端：

```bash
EXPO_PUBLIC_API_BASE_URL=http://localhost:3001 pnpm --filter mobile start
```

移动端真实安装验收不能使用手机浏览器访问 Web，也不能只用 Expo Go
作为最终证据。用手机可访问的 API 地址构建并安装原生 App：

```bash
EXPO_PUBLIC_API_BASE_URL=http://<手机可访问的API地址>:3001 pnpm mobile:android:release
EXPO_PUBLIC_API_BASE_URL=http://<手机可访问的API地址>:3001 pnpm mobile:ios:release
```

详细步骤见 `docs/operations/mobile-installable-acceptance.md`。

桌面端：

```bash
DESKTOP_WEB_URL=http://localhost:3000 pnpm --filter desktop start
```

默认地址：

- Web: `http://localhost:3000`
- API: `http://localhost:3001`

## 3. 登录后怎么用

1. 打开 `http://localhost:3000`。
2. 注册或登录账号。
3. 进入 `设置 > 模型连接`。
4. 添加一个 OpenCode-backed 国产模型连接，点击 `验证连接`，通过后点击 `保存并启用`。
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
pnpm --filter desktop build
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
pnpm --filter mobile test
pnpm --filter mobile exec expo install --check
./node_modules/.bin/tsc -p apps/mobile/tsconfig.json --noEmit --pretty false
EXPO_PUBLIC_API_BASE_URL=http://<手机可访问的API地址>:3001 pnpm mobile:android:release
EXPO_PUBLIC_API_BASE_URL=http://<手机可访问的API地址>:3001 pnpm mobile:ios:release
pnpm --filter desktop test
pnpm --filter api build
pnpm exec vitest run tests/integration/deepseek-connection.spec.ts
pnpm exec vitest run tests/integration/coding-workflow-api.spec.ts
pnpm exec vitest run tests/integration/coding-workflow-execution.spec.ts
```

### 真实部署验收

`/deploy` 现在支持三类真实 provider 验收：

- `static-site` -> Vercel deployment. The real acceptance script defaults to
  `VERCEL_DEPLOY_TARGET=production` so the temporary `*.vercel.app` project
  domain is publicly readable without Vercel preview authentication.
- `container` -> Fly.io Machines app
- `source-archive` -> S3/R2 公开对象下载

运行前必须用同一组环境变量启动 `api` 和 `worker`，尤其是 `S3_*`、`S3_PUBLIC_BASE_URL` 和 `CREDENTIAL_ENCRYPTION_KEY`。本地服务启动后执行：

```bash
node --env-file=.env $(which pnpm) deploy:acceptance:real
```

缺少凭证时，脚本会先列出缺项并退出，不会触发外部资源创建。只想先创建 deploy target 时：

```bash
pnpm deploy:seed-targets:real
```

验收通过后，脚本会输出临时 Vercel project、Fly app 和 S3/R2 key 的清理变量。设置这些变量后执行：

```bash
node --env-file=.env $(which pnpm) deploy:cleanup:real
```

需要一次性提供/配置的真实部署材料：

- `VERCEL_TOKEN`
- `VERCEL_TEAM_ID`，个人账号可留空
- `VERCEL_PROJECT_PREFIX`，默认 `miaochat-static`
- `VERCEL_DEPLOY_TARGET`，默认 `production`
- `FLY_API_TOKEN`
- `FLY_ORG_SLUG`，默认 `personal`
- `FLY_REGION`，默认 `syd`
- `FLY_APP_PREFIX`，默认 `miaochat-container`
- `S3_ENDPOINT`
- `S3_REGION`
- `S3_ACCESS_KEY`
- `S3_SECRET_KEY`
- `S3_BUCKET`
- `S3_PUBLIC_BASE_URL`，必须能公开访问 `S3_BUCKET` 下的对象
- `CREDENTIAL_ENCRYPTION_KEY`，API 和 worker 必须一致
- OpenCode-backed 模型 API Key，用于完整编码协作 demo，不是部署脚本本身必需

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
- 移动端 Expo MVP，可直接连 API 完成会话查看、审批、附件/产物预览
- 桌面端 Electron MVP，可启动窗口并通过 preload IPC 暴露文件、通知和本地 Agent 能力
- 部署 worker 已接入 Vercel、Fly.io 和 S3/R2 真实 provider 适配器，并提供 `pnpm deploy:acceptance:real` 做端到端验收

仍需真实人工验收：

- 使用真实 OpenCode-backed 模型连接完整跑通编码协作闭环
- 使用真实 Vercel/Fly/S3 或 R2 凭证运行 `pnpm deploy:acceptance:real`
- 移动端模拟器/真机录屏或 Android 包验收
- 桌面端 Electron 启动或打包验收
- 录制 3 分钟 Demo 视频
- Staging 环境全量验收
- 正式负载测试结果

## 6. 仓库结构

```text
apps/
  web/      Next.js Web 客户端
  mobile/   Expo 移动端
  desktop/  Electron 桌面端
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
