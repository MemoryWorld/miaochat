# OpenCode Provider 迁移指南

本指南用于把当前 Miaochat 部署从旧的 `DeepSeek` 直连接入，迁移到
`OpenCode` 作为国产模型统一入口的版本。迁移后，新建模型连接和新建
AI 同事默认走 `OpenCode`；历史 `DeepSeek` 连接保留为兼容数据，worker
在没有 `OpenCode` 凭证时仍可回退读取旧连接，避免老环境立刻断流。

## 当前部署边界

先把几个容易混淆的点固定下来：

- Cloudflare 不是当前整套应用的主部署平台。
- Cloudflare R2 只作为 S3 兼容对象存储使用，对应 artifact、源码包和部署验收中的 `source-archive`。
- 静态站点真实验收走 Vercel，对应 `static-site`。
- 容器真实验收走 Fly.io Machines，对应 `container`。
- API、worker、web、mobile、desktop 仍然按各自运行环境部署。
- 数据库是 Postgres，本地和集群建议通过 PgBouncer 暴露一个统一 `DATABASE_URL`。

## 本次代码版本包含什么

本版本的关键变更是：

- 数据库枚举 `provider_id` 新增 `opencode`，迁移文件为 `db/migrations/0033_add_opencode_provider.sql`。
- `设置 > 模型连接` 支持 DeepSeek、Qwen、Moonshot/Kimi、Zhipu GLM、MiniMax 和自定义 OpenCode provider id。
- 新建 AI 同事默认 provider 从 `deepseek` 切到 `opencode`。
- 编码 workflow 默认优先使用 `opencode` 凭证；如果生产环境还只有旧 `deepseek` 凭证，会兼容回退。
- Claude Code 与 Codex 继续保留独立 provider，不受这次 OpenCode 迁移影响。
- 聊天历史和手动 pin 消息会进入 agent 请求上下文，长上下文预算由 `MIAOCHAT_AGENT_HISTORY_MESSAGE_LIMIT` 和 `MIAOCHAT_AGENT_CONTEXT_CHAR_BUDGET` 控制。

## 迁移前检查

1. 确认当前线上分支和数据库备份。

   ```bash
   git rev-parse --short HEAD
   pg_dump "$DATABASE_URL" > miaochat-before-opencode.sql
   ```

2. 确认 API 和 worker 使用同一个 `DATABASE_URL`。

   本地开发推荐：

   ```bash
   DATABASE_URL=postgres://agenthub:agenthub@localhost:6432/agenthub
   ```

   Kubernetes / PgBouncer 推荐：

   ```bash
   DATABASE_URL=postgres://agenthub:agenthub@pgbouncer:5432/agenthub
   ```

3. 确认 `CREDENTIAL_ENCRYPTION_KEY` 在 API 和 worker 中完全一致。

4. 确认 `.env`、`.env.local`、真实 token 和真实 API Key 不会提交到 Git。

   ```bash
   git status --short
   git ls-files .env .env.local
   ```

   第二条命令应该没有输出。

## 必需环境变量

生产或验收环境至少需要：

```bash
DATABASE_URL=
CREDENTIAL_ENCRYPTION_KEY=
NEXT_PUBLIC_API_BASE_URL=
```

OpenCode/model 连接本身优先在 Web UI 的 `设置 > 模型连接` 中保存，不需要把用户模型 key 固定写进仓库。可选运行参数：

```bash
OPENCODE_MODEL=
MIAOCHAT_AGENT_HISTORY_MESSAGE_LIMIT=12
MIAOCHAT_AGENT_CONTEXT_CHAR_BUDGET=12000
```

真实部署验收还需要：

```bash
VERCEL_TOKEN=
VERCEL_TEAM_ID=
VERCEL_PROJECT_PREFIX=miaochat-static
VERCEL_DEPLOY_TARGET=production
FLY_API_TOKEN=
FLY_ORG_SLUG=personal
FLY_REGION=syd
FLY_APP_PREFIX=miaochat-container
S3_ENDPOINT=
S3_REGION=
S3_ACCESS_KEY=
S3_SECRET_KEY=
S3_BUCKET=
S3_PUBLIC_BASE_URL=
```

如果 `S3_ENDPOINT` 指向 Cloudflare R2，`S3_PUBLIC_BASE_URL` 必须是能公开访问对象的 URL 前缀，否则源码包和 artifact 下载会在浏览器侧失败。

## 数据库迁移

在目标环境执行：

```bash
node --env-file=.env $(which pnpm) db:migrate
```

如果目标环境已经通过容器或平台注入环境变量，也可以直接执行：

```bash
pnpm db:migrate
```

迁移完成后检查枚举：

```sql
SELECT enumlabel
FROM pg_enum
WHERE enumtypid = 'provider_id'::regtype
ORDER BY enumsortorder;
```

结果必须包含：

```text
opencode
```

如果后端报错 `invalid input value for enum provider_id: "opencode"`，说明 API/worker 连接的不是刚才迁移过的数据库，优先检查 `DATABASE_URL` 是否指向了错误库或绕过了 PgBouncer。

## 部署顺序

推荐顺序：

1. 停止旧 worker，避免旧代码消费新 provider 数据。
2. 备份数据库。
3. 执行 `pnpm db:migrate`。
4. 部署 API。
5. 部署 worker。
6. 部署 web。
7. 再部署 mobile 和 desktop 包，或至少确认它们指向新的 API 地址。

API 和 worker 必须成对升级。只升级 web 会看到 OpenCode UI，但后端不能完整执行；只升级 worker 会导致 UI 仍然引导用户创建旧 DeepSeek 连接。

## 迁移后验收

### 1. 模型连接

1. 打开 `设置 > 模型连接`。
2. 选择一个 OpenCode-backed 预设，例如 `DeepSeek`、`Qwen`、`Kimi`、`GLM` 或 `MiniMax`。
3. 填写 provider id、model 和 API Key。
4. 点击验证。
5. 保存并启用。

后端接口应返回 `provider: "opencode"`。旧连接列表里如果看到 `provider: "deepseek"`，那只是历史兼容连接，不是新默认路径。

### 2. AI 同事

1. 打开自建 AI 同事或编码工作模式。
2. 新建同事时，默认 provider 应显示为 `国产模型 / OpenCode`。
3. 保存后启动一个简单频道任务。
4. worker 日志中不应再出现缺少 DeepSeek 直连 key 的错误。

### 3. 编码 workflow

1. 创建 4 同事编码工作流。
2. 让技术负责人先生成计划。
3. 批准计划。
4. 确认软件工程师、代码评审、QA 或技术负责人后续消息能落库。
5. 确认 HTML/Markdown artifact 能在右侧预览、打开和下载。

### 4. 部署验收

启动 API 和 worker 时必须带同一组部署环境变量，然后执行：

```bash
node --env-file=.env $(which pnpm) deploy:acceptance:real
```

通过标准：

- Vercel 产出一个可公开访问的静态站点 URL。
- Fly.io 产出一个 `*.fly.dev` 容器 URL。
- S3/R2 产出一个可公开下载的源码包 URL。
- 脚本报告显示 `PASSED`，并能回读 run marker。

验收结束后执行清理：

```bash
node --env-file=.env $(which pnpm) deploy:cleanup:real
```

## 移动端和桌面端迁移

移动端不是手机浏览器访问 web 端口，最终验收必须是真实可安装 App。

Android：

```bash
EXPO_PUBLIC_API_BASE_URL=http://<手机可访问的API地址>:3001 pnpm mobile:android:release
```

iOS：

```bash
EXPO_PUBLIC_API_BASE_URL=http://<手机可访问的API地址>:3001 pnpm mobile:ios:release
```

桌面端：

```bash
DESKTOP_WEB_URL=https://<你的Web域名> pnpm --filter desktop build
```

本地 smoke：

```bash
DESKTOP_WEB_URL=http://localhost:3000 pnpm --filter desktop start
```

## 回滚策略

Postgres enum 增加 `opencode` 后不建议尝试删除该 enum value。安全回滚方式是：

1. 保留数据库迁移。
2. 回滚 API/worker/web 到上一个稳定镜像。
3. 如果旧代码无法解析 `opencode` 凭证列表，先在数据库中禁用或迁移新建的 `opencode` credential rows，再回滚旧服务。
4. 不要回滚 `CREDENTIAL_ENCRYPTION_KEY`，否则历史加密凭证会无法解密。

推荐的实际策略是前滚修复，而不是删除 enum。

## 常见故障

| 现象 | 优先检查 |
| --- | --- |
| `invalid input value for enum provider_id: "opencode"` | 迁移跑错数据库；确认 API/worker 的 `DATABASE_URL`。 |
| `No valid BYOK credential found for provider opencode` | Web UI 里还没有保存有效 OpenCode 连接；旧 DeepSeek 连接也不可用。 |
| `OpenCode SDK 不可用` | 确认部署镜像包含最新 `pnpm-lock.yaml` 和 `@opencode-ai/sdk` 依赖。 |
| UI 仍只提示添加 DeepSeek API Key | web 没有部署到本版本，或浏览器缓存了旧 bundle。 |
| artifact 预览失败但下载成功 | 前端可能绕过了 `/artifacts/:id/content`，应确认使用认证 content API。 |
| 部署验收 R2 下载失败 | `S3_PUBLIC_BASE_URL` 不公开，或 bucket/object policy 不允许公开读取。 |

## 本地已验证命令

本迁移版本本地已跑过以下关键命令：

```bash
pnpm --filter @agenthub/contracts test -- --runInBand
pnpm --filter web test -- model-connections-panel.spec.tsx teammate-create-wizard.spec.tsx settings-host.spec.tsx --runInBand
pnpm --filter worker exec vitest run --config vitest.config.ts test/internal-runtime-registry.spec.ts
pnpm --filter @agenthub/agent-adapters exec vitest run --config vitest.config.ts test/opencode-adapter.spec.ts test/adapter-factory.spec.ts
pnpm exec vitest run tests/integration/deepseek-connection.spec.ts
pnpm --filter api exec vitest run --config vitest.config.ts test/conversations.e2e-spec.ts
pnpm --filter api exec vitest run --config vitest.config.ts test/channel-collaboration.e2e-spec.ts
pnpm exec vitest run tests/integration/coding-workflow-api.spec.ts tests/integration/workspace-shell-api.spec.ts
pnpm --filter @agenthub/contracts build
pnpm --filter @agenthub/agent-adapters build
pnpm --filter api build
pnpm --filter worker build
pnpm --filter web build
```
