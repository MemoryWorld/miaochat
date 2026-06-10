# Miaochat / AgentHub 多 Agent 协作平台

Miaochat 是一个 IM 聊天式多 Agent 协作平台。用户像使用 Telegram、飞书或微信一样创建会话，选择 Codex、Claude Code、OpenCode 或平台自建 Agent，通过单聊、群聊、`@` 提及和 Orchestrator 分派来完成网页、Workflow、文档、代码 Diff、部署等产物交付。

本仓库是比赛课题 `AgentHub - 多 Agent 协作平台` 的简化实战版。核心目标不是再做一个聊天框，而是把 AI Agent 做成可持续协作的“联系人”和“同事”：能读上下文、能接任务、能交付产物、能把计划和执行记录沉淀在同一条会话时间线里。

## 当前能力概览

- IM 核心体验：左侧会话列表、新建会话、置顶、归档、搜索、最近活跃排序。
- 单聊 Agent：与 Codex、Claude Code、OpenCode 或自建 Agent 进行 1v1 对话。
- 群聊协作：一个会话中包含多个 Agent，支持 `@` 指定或 Orchestrator 自动分派。
- 上下文管理：聊天历史自动作为上下文传递，支持 pin 关键消息作为长期上下文。
- 网页制作协作：用户提出网页需求后，技术负责人先出计划，用户批准后进入工程师实现、代码评审、QA 验收和最终汇总。
- 可视化 Workflow：用户可通过自然语言创建可预览、可执行、可复用的节点流程。
- 产物内联：支持 Markdown、HTML 网页预览、Diff 卡片、文件附件、部署状态卡片。
- Agent 接入：OpenAI/Codex、Anthropic/Claude Code、OpenCode，以及平台自建 Agent。
- 部署发布：支持 Vercel 静态站点、Fly.io 容器预览、S3/R2 源码包下载的真实 provider 验收。
- 多端 MVP：Web 主力端、Expo 移动端、Electron 桌面端。

## 快速开始

### 1. 环境要求

- Node.js `>= 22`
- pnpm `>= 10`
- Docker + Docker Compose
- 可选：Android Studio / Xcode 用于移动端真机或模拟器安装验收
- 可选：Electron 桌面端运行环境

### 2. 安装依赖

```bash
pnpm install
```

### 3. 准备环境变量

```bash
cp .env.example .env
```

`.env.example` 已提供本地开发默认值。真实 API Key、部署 token 和生产凭证只写入本地 `.env`，不要提交到 Git。

推荐使用 Node 的 env-file 方式运行需要环境变量的命令：

```bash
node --env-file=.env $(which pnpm) <command>
```

Web 本地代理默认使用：

```bash
NEXT_PUBLIC_API_BASE_URL=/api
```

模型连接可以在 Web 设置页中录入；本地 `.env` 里的模型变量主要用于服务端、worker 或验收脚本。

### 4. 启动基础设施

```bash
docker compose -f infra/docker/compose.dev.yml up -d postgres pgbouncer redis temporal minio
```

### 5. 初始化数据库

```bash
node --env-file=.env $(which pnpm) db:migrate
node --env-file=.env $(which pnpm) db:seed
```

### 6. 启动 Web/API/Worker

推荐一条命令启动三项服务：

```bash
node --env-file=.env $(which pnpm) dev:all
```

也可以分开启动：

```bash
node --env-file=.env $(which pnpm) --filter api dev
node --env-file=.env $(which pnpm) --filter worker dev
pnpm --filter web dev
```

默认地址：

- Web: `http://localhost:3000`
- API health: `http://localhost:3001/health`
- Temporal: `localhost:7233`
- PostgreSQL via PgBouncer: `localhost:6432`
- MinIO/S3-compatible storage: `localhost:9000`

## 登录后怎么用

1. 打开 `http://localhost:3000`。
2. 注册或登录账号。
3. 进入 `设置 > 模型连接`，添加 OpenAI、Claude、DeepSeek、Qwen、Kimi、GLM、MiniMax 或 OpenCode 自定义连接。
4. 保存并验证模型连接。
5. 在联系人或新建对话面板中选择 Agent：
   - `Codex`：OpenAI/Codex 运行时。
   - `Claude Code`：Anthropic/Claude Code 运行时。
   - `OpenCode`：DeepSeek、Qwen、Kimi、GLM、MiniMax 等模型的统一运行时。
   - `平台自建 Agent`：用户配置名称、头像、职责、能力标签、系统提示词和运行模型。
6. 新建单聊或群聊。
7. 发送普通任务进行 Agent 对话；发送“制作网页”“生成 HTML”“做一个 todolist 网站”等网页需求会进入网页制作协作。
8. 网页制作协作会先由技术负责人输出计划；点击批准后，软件工程师、代码评审工程师、质量保障测试工程师继续在同一会话中完成交付。
9. HTML、Markdown、Diff 和附件会出现在聊天流、右侧预览和文件区域。
10. 需要可复用流程时，发送“创建一个 xxx workflow”，系统会生成可视化 Workflow 预览；用户确认执行后查看节点级运行状态和产物。

## 常用命令

| 命令 | 用途 |
| --- | --- |
| `pnpm install` | 安装 monorepo 依赖 |
| `node --env-file=.env $(which pnpm) dev:all` | 同时启动 API、Web、Worker |
| `pnpm --filter web dev` | 启动 Next.js Web |
| `pnpm --filter api dev` | 启动 NestJS API |
| `pnpm --filter worker dev` | 启动 Temporal worker |
| `pnpm build` | 构建全部 workspace |
| `pnpm test` | 跑全部测试 |
| `pnpm --filter web test` | 跑 Web 单元/组件测试 |
| `pnpm --filter api test` | 跑 API 测试 |
| `pnpm --filter worker test` | 跑 Worker 测试 |
| `pnpm test:e2e:smoke` | 跑 E2E smoke 测试 |
| `node --env-file=.env $(which pnpm) db:migrate` | 应用数据库迁移 |
| `node --env-file=.env $(which pnpm) db:seed` | 写入 seed 数据 |

常用定向验证：

```bash
pnpm --filter @agenthub/contracts exec tsc --noEmit --project tsconfig.build.json
pnpm --filter api exec tsc --noEmit --project tsconfig.build.json
pnpm --filter web exec tsc --noEmit --project tsconfig.json
pnpm --filter worker exec tsc --noEmit --project tsconfig.build.json
pnpm --filter api exec vitest run --config vitest.config.ts test/message-dispatch.service.spec.ts test/coding-workflow-dispatch.service.spec.ts test/coding-workflows-runtime.spec.ts
pnpm --filter web exec vitest run --config vitest.config.ts src/features/workmodes/work-mode-launcher.spec.tsx src/features/chat/chat-experience.spec.tsx src/features/channels/channel-shell.spec.tsx src/features/channels/channel-overview-page.spec.tsx
```

## 产品设计说明

### 产品定位

Miaochat 的产品形态是“AI 同事工作区”，而不是普通问答机器人。每个 Agent 都是一个聊天联系人，用户通过 IM 式会话完成任务分发、上下文传递、产物预览和协作记录沉淀。

### 目标用户

- 个人开发者：需要同时调用多个代码 Agent，完成网页、组件、文档和部署任务。
- 小团队：需要在同一个工作区中看见 AI 计划、执行、评审、QA 和失败恢复记录。
- 高阶用户：需要自建 Agent，并为不同任务配置不同模型、职责和工具能力。

### 核心流程

- 模型连接：用户在设置页录入 API Key，服务端加密保存，前端不回显密钥。
- Agent 创建：模型连接可映射为 Codex、Claude Code、OpenCode 或平台自建 Agent。
- IM 会话：单聊适合明确任务，群聊适合多 Agent 协作。
- 网页制作：先计划，后审批，再实现、评审、QA、汇总。
- 可视化 Workflow：自然语言创建节点流程，先预览再执行。
- 产物交付：聊天流内联预览，文件区持久化，支持打开、下载、版本记录和 Diff。

### 设计原则

- Workspace-first：所有会话、文件、Agent、任务和记忆都归属工作区。
- AI teammate language：用户看到的是“AI 同事”和职责，不直接暴露内部执行后端。
- Plan-before-execution：高影响任务必须先计划并等待用户确认。
- Artifact truth：AI 声称生成文件时，必须有真实 artifact；没有产物不能口头冒充完成。
- Failure-explicit：失败必须写入时间线，并提供可理解的失败原因和恢复入口。
- Secret-safe：密钥只走认证 API 和服务端加密存储，日志和 UI 不展示真实 secret。

完整产品设计见：

- [产品设计文档](./docs/product/product-design.md)
- [原始课题需求](./docs/product/original-requirements.md)


## 技术架构

### Monorepo 结构

```text
apps/
  web/      Next.js + React Web 客户端
  api/      NestJS + Fastify API
  worker/   Temporal Worker，负责 Agent 执行、部署、长任务编排
  mobile/   Expo 移动端
  desktop/  Electron 桌面端

packages/
  contracts/        Zod schema、DTO、共享类型
  agent-sdk/        统一 Agent 执行契约
  agent-adapters/   Codex、Claude Code、OpenCode 等适配器
  domain/           Orchestrator 与领域逻辑
  tool-runtime/     工具注册和执行运行时

db/
  migrations/       PostgreSQL 迁移
  seeds/            本地 seed 数据

docs/
  product/          产品、Demo、需求覆盖
  architecture/     架构说明和边界决策
  operations/       运行、部署、验收、观测文档

ai/
  specs/            版本化需求快照
  plans/            实施计划
  tasks/            任务拆解
  rules/            AI 协作规则
  logs/             AI 协作开发记录
```

### 运行时分层

- Web 只负责交互、预览、会话状态和用户操作。
- API 负责认证、工作区、会话、消息、Agent 配置、artifact、权限和控制面 API。
- Worker 负责 Temporal 长任务、模型调用、Orchestrator、产物生成、部署 provider 调用。
- PostgreSQL 是权威业务数据库。
- Redis 用于限流、缓存和事件辅助。
- S3-compatible storage 保存附件、HTML、Markdown、Diff 和源码包。
- PgBouncer 处理数据库连接池。

### Agent 适配边界

所有模型和 Agent 平台通过统一适配器接入：

- OpenAI/Codex：面向 Codex Agent。
- Anthropic/Claude Code：面向 Claude Code Agent。
- OpenCode：用于 DeepSeek、Qwen、Kimi、GLM、MiniMax 等模型统一接入。
- 平台自建 Agent：基于用户选择的模型连接、系统提示词、能力标签和工具配置。

浏览器不会选择底层 runtime，也不会拿到 raw API Key。运行时路由、credential 解析和 provider 调用都在服务端完成。

关键架构文档：

- [Phase A Architecture Brief](./docs/architecture/phase-a-architecture-brief.md)
- [Model Connection Runtime Boundary](./docs/architecture/phase-e-model-connection-runtime-boundary.md)
- [Channel Access Model](./docs/architecture/phase-f-channel-access-model.md)
- [Runtime Readiness](./docs/architecture/runtime-readiness.md)
- [Agent Harness Design](./docs/agent%20harnessdesign/00-index.md)

## 环境变量说明

本地开发从 `.env.example` 复制 `.env`。常见变量：

| 变量 | 用途 |
| --- | --- |
| `DATABASE_URL` | PostgreSQL/PgBouncer 连接 |
| `REDIS_URL` | Redis 连接 |
| `TEMPORAL_ADDRESS` | Temporal 服务地址 |
| `S3_ENDPOINT` / `S3_REGION` / `S3_BUCKET` | S3-compatible artifact 存储 |
| `S3_ACCESS_KEY` / `S3_SECRET_KEY` | 本地 MinIO 或真实对象存储凭证 |
| `S3_PUBLIC_BASE_URL` | 真实部署验收时的公开对象访问地址 |
| `CREDENTIAL_ENCRYPTION_KEY` | 模型和部署凭证加密 key，API 与 worker 必须一致 |
| `NEXT_PUBLIC_API_BASE_URL` | Web 调 API 的 base URL，本地默认 `/api` |
| `DEEPSEEK_API_KEY` | DeepSeek/OpenCode 兼容模型 key，可选 |
| `CODEX_MODEL` | Codex 默认模型，可选 |
| `CLAUDE_CODE_MODEL` | Claude Code 默认模型，可选 |
| `OPENCODE_MODEL` | OpenCode 默认模型，可选 |
| `VERCEL_TOKEN` | Vercel 真实部署验收 |
| `FLY_API_TOKEN` | Fly.io 真实部署验收 |

不要提交 `.env`、`.env.local`、真实 token、真实 API Key 或数据库 dump。

## 移动端与桌面端

### Expo 移动端

开发模式：

```bash
EXPO_PUBLIC_API_BASE_URL=http://localhost:3001 pnpm --filter mobile start
```

真机或模拟器安装验收：

```bash
EXPO_PUBLIC_API_BASE_URL=http://<手机可访问的API地址>:3001 pnpm mobile:android:release
EXPO_PUBLIC_API_BASE_URL=http://<手机可访问的API地址>:3001 pnpm mobile:ios:release
```

移动端最终交付应使用真实可安装 App 或模拟器录屏。只用手机浏览器访问 Web，或只用 Expo Go，不算最终移动端交付证据。

详情见 [Mobile Installable Acceptance](./docs/operations/mobile-installable-acceptance.md)。

### Electron 桌面端

```bash
DESKTOP_WEB_URL=http://localhost:3000 pnpm --filter desktop start
pnpm --filter desktop package
```

桌面端用于 Web 壳、本地文件选择、系统通知和本地 Agent 进程桥接。

## 部署与真实验收

部署 worker 支持三类 provider：

- `static-site` -> Vercel deployment
- `container` -> Fly.io Machines app
- `source-archive` -> S3/R2 公开对象下载

运行真实部署验收：

```bash
node --env-file=.env $(which pnpm) deploy:acceptance:real
```

只创建 deploy target：

```bash
node --env-file=.env $(which pnpm) deploy:seed-targets:real
```

清理真实外部资源：

```bash
node --env-file=.env $(which pnpm) deploy:cleanup:real
```

部署前至少需要：

- `VERCEL_TOKEN`
- `FLY_API_TOKEN`
- `S3_ENDPOINT`
- `S3_ACCESS_KEY`
- `S3_SECRET_KEY`
- `S3_BUCKET`
- `S3_PUBLIC_BASE_URL`
- `CREDENTIAL_ENCRYPTION_KEY`

详细发布门禁见：

- [Release Checklist](./docs/operations/release-checklist.md)
- [Provider Acceptance](./docs/operations/provider-acceptance.md)
- [OpenCode Provider Migration](./docs/operations/opencode-provider-migration.md)

## AI 协作开发记录

本项目按课题要求沉淀了 AI 协作过程，不只提交最终代码。

| 目录 | 内容 |
| --- | --- |
| [`ai/specs/`](./ai/specs/) | 版本化需求、阶段目标和验收边界 |
| [`ai/plans/`](./ai/plans/) | 分阶段实施计划 |
| [`ai/tasks/`](./ai/tasks/) | 可执行任务拆解 |
| [`ai/rules/`](./ai/rules/) | AI 协作规则和约束 |
| [`ai/logs/`](./ai/logs/) | AI 协作开发记录、问题修复、阶段 closeout |

推荐阅读：

- [AI logs README](./ai/logs/README.md)
- [AI plans README](./ai/plans/README.md)
- [AI specs README](./ai/specs/README.md)
- [Original Requirements Closeout](./ai/logs/2026-06-04-original-requirements-closeout.md)
- [Claude/Codex Real Runtime Log](./ai/logs/2026-06-04-claude-codex-real-runtime.md)
- [Agent Runtime Hardening Log](./ai/logs/2026-06-04-agent-runtime-hardening.md)

## 当前验收状态

已具备源码和文档支撑：

- 产品设计文档
- 技术文档
- 可运行 Web Demo
- AI 协作开发记录
- IM 会话、单聊、群聊、上下文连续、pin 长期上下文
- Codex、Claude Code、OpenCode 和自建 Agent 接入路径
- HTML / Markdown / Diff / 附件 / 部署状态卡片
- 网页制作协作闭环
- 可视化 Workflow 预览和执行
- 移动端 Expo MVP
- 桌面端 Electron MVP
- Vercel / Fly.io / S3/R2 真实部署 provider 适配器

仍需人工交付或人工录制：

- 3 分钟 Demo 视频
- 移动端 Android/iOS 可安装 App 实机或模拟器录屏
- 桌面端 Electron 启动或打包录屏
- 使用真实模型 API Key 的浏览器完整验收
- Staging secrets-backed 全量验收
- 正式负载测试结果

详细覆盖矩阵见 [Original Requirements Coverage](./docs/product/original-requirements-coverage.md)。

## 常见问题

### Web 页面显示未登录，但 API session 正常

优先检查 Web 是否通过 `/api` 代理访问 API，以及 `NEXT_PUBLIC_API_BASE_URL` 是否为本地推荐值 `/api`。直接跨端口请求时要确认 cookie、CORS 和 credentials。

### Agent 回复“执行失败”或没有产物

检查：

- 模型连接是否已验证。
- API 与 worker 是否使用同一个 `.env` 和 `CREDENTIAL_ENCRYPTION_KEY`。
- Temporal worker 是否已启动。
- `S3_*` / MinIO 是否可写。
- 聊天请求是否确实上传并持久化了附件。

### Markdown 或 HTML 不能预览

前端应通过同源鉴权 API 读取：

- `GET /artifacts/:artifactId/content`
- `GET /artifacts/:artifactId/download`

不要直接访问未签名的对象存储 URL。

### 数据库迁移后仍报列不存在

确认当前服务连接的数据库和执行迁移的数据库一致。推荐统一使用：

```bash
node --env-file=.env $(which pnpm) db:migrate
node --env-file=.env $(which pnpm) dev:all
```

## 停止本地环境

停止容器：

```bash
docker compose -f infra/docker/compose.dev.yml stop postgres pgbouncer redis temporal minio
```

彻底清理容器和卷：

```bash
docker compose -f infra/docker/compose.dev.yml down -v
```

停止 Node 开发服务时，结束对应终端里的 `pnpm dev:all`、`api dev`、`worker dev`、`web dev` 进程即可。
