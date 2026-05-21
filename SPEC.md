# Spec: AgentHub 多 Agent 协作平台

## Assumptions I'm Making

1. 首轮交付目标明确为 `Web MVP`，桌面端、移动端、代码二次编辑、版本历史、一键部署发布不进入首轮实现。
2. 本项目按真实落地的生产级应用处理，不接受“为了先跑通 MVP 而故意选择后续必然重构或迁移的基础架构”。
3. 源需求 `.docx` 约束的是产品能力，不约束仓库拓扑或部署形态，因此采用前端、后端、异步工作进程分离的多应用架构是被允许的，也更符合高并发目标。
4. 多人协作、用户登录、工作区隔离、权限模型、共享会话是产品必须补齐的能力，但明确延后到首轮 `Web MVP` 之后；这些能力必须以“延期但强制补齐”的方式记录在仓库内，不能在后续开发中被遗忘或降级掉。
5. 本地开发和前几轮测试允许使用统一接口下的 `mock adapter`，但首轮正式交付验收必须全部真实接入 `Hermes`、`OpenClaw`、`Codex`、`Claude Code`，不能以一真一假或全 mock 替代。
6. 用户自建 Agent 需要同时覆盖两类用户：
   - 轻度用户：保存配置后直接在会话中选用
   - 重度用户：支持完整工具链扩展
7. MVP 阶段虽然不实现登录和权限，但数据模型与服务边界必须为未来的 `workspace`、`member`、`role`、`permission`、`shared conversation` 预留扩展位，避免后期大迁移。
8. Release 1 的 Provider 凭据模式固定为 `BYOK only`；同时架构必须预留 `platform_managed` 扩展位，供后续平台统一托管凭据模式接入。
9. 除业务代码外，仓库必须沉淀 AI 协作记录，包括 `spec / plan / tasks / rules / logs` 文件体系。

如果以上假设有偏差，应在本 spec 审阅阶段修正，再进入 `PLAN`。

## Objective

构建一个以 IM 聊天为核心交互范式的多 Agent 协作平台 `AgentHub`。用户像使用飞书或微信一样，通过会话列表、聊天流、@ 提及和群聊协作，与多个 AI Agent 完成网页、代码、文档等产物生成、反馈、迭代和交付。

产品目标：

- 把 AI Agent 从“单次问答接口”提升为“可持续协作的工作对象”
- 通过统一适配层接入多个主流 Agent 平台，并屏蔽不同平台的 API 差异
- 在聊天流中直接承载结构化产物，而不是只返回纯文本
- 为后续多人协作、权限隔离、共享会话和更完整的产物工作流打下不需要重构的底座

目标用户：

- 需要同时调用多个 Agent 协作完成复杂任务的个人开发者、产品人员、技术团队
- 需要在统一界面里管理不同 Agent、不同上下文、不同产物的使用者

首轮 `Web MVP` 要解决的问题：

- 用户可以在统一 Web 界面中创建多个会话，与不同 Agent 单聊或群聊
- 平台能够持久化上下文，并让 Agent 基于会话历史持续工作
- 平台能够通过统一适配器层接入不同 Agent 平台，并支持后续扩展
- 平台能够在聊天流内渲染产物卡片、附件和基础 Diff，而不只是纯文本

## Scope

### Release 1: Web MVP In Scope

- Web 端完整聊天体验
- 会话列表：新建、切换、归档、搜索、按最近活跃排序
- 单聊模式：一个会话绑定一个主 Agent
- 群聊模式：同一会话容纳多个 Agent，支持 `@agent` 指定和 Orchestrator 自动分派
- 上下文管理：消息历史持久化、关键消息 `pin` 为长期上下文
- 实时响应：支持流式输出或分段输出
- 统一 Agent 适配层
- 正式交付时真实接入 `Hermes`、`OpenClaw`、`Codex`、`Claude Code`
- 用户自建 Agent：
  - 轻量模式：配置 `name / avatar / capability tags / system prompt / tool bindings`
  - 扩展模式：首轮以开发者配置文件或服务端注册方式接入完整工具链扩展
- 聊天流结构化消息渲染：文本、代码块、图片、文件附件、网页预览卡片、基础 Diff 卡片
- Orchestrator：任务拆解、顺序/并行调度、超时控制、失败降级、结果汇总
- 生产运维基线：结构化日志、基础指标、错误追踪、配置隔离
- Provider 凭据模式：Release 1 固定为 `BYOK only`，并把用户自带 Provider 凭据接入引导做成低门槛流程

### Deferred But Mandatory After Release 1

- 用户登录
- 工作区隔离
- 多人协作
- 角色与权限模型
- 共享会话与协作审计
- 桌面端
- 移动端
- 代码二次编辑
- 版本历史
- 一键部署发布与部署状态卡片
- 重度自建 Agent 的可视化管理界面

这些能力不是可选项，只是首轮延期项。后续 `PLAN / TASKS` 阶段必须为其保留演进路径。

### Strategic Deferred Capability

- `platform_managed` Provider 凭据模式

这不是 Release 1 的实现范围，但属于后续战略能力，不应被当作普通可选项处理。首轮架构必须预留凭据来源抽象、凭据池管理、用量统计和配额治理的扩展位。

### Out of Scope for Release 1

- 计费系统
- 企业级结算后台
- 复杂审批流
- 跨区域多活

## Tech Stack

为满足真实生产环境、可横向扩展、高并发和后续多人协作演进，当前建议技术栈如下：

- 语言与包管理：
  - `TypeScript`
  - `Node.js LTS`
  - `pnpm workspace`
  - `Turborepo`
- 前端：
  - `Next.js` 作为 Web 应用框架
  - `React`
  - `Tailwind CSS`
  - 组件层可采用 `shadcn/ui` 风格基座，但不把其当成架构依赖
- 后端 API：
  - `NestJS` 作为服务端主框架
  - `Fastify` 作为 HTTP 适配层
  - `WebSocket` 或 `SSE` 用于聊天流实时推送
- 编排与异步执行：
  - `Temporal` 作为 Orchestrator 的 durable workflow 引擎
  - 独立 `worker` 进程执行 Agent 调用、并行 fan-out、重试、超时和汇总
- 数据与存储：
  - `PostgreSQL` 作为权威业务数据库
  - `pgBouncer` 处理连接池
  - `Redis` 作为缓存、限流、会话热点数据和事件中转辅助层
  - `S3-compatible object storage` 作为附件与产物文件存储
- 数据访问与契约：
  - `Drizzle ORM` 或等价 SQL-first 方案
  - `Zod` 做输入校验与消息 schema 定义
- 观测与运维：
  - `Pino` 结构化日志
  - `OpenTelemetry`
  - `Prometheus + Grafana`
  - `Sentry` 或等价错误追踪方案
- 测试：
  - `Vitest`
  - `Supertest`
  - `Playwright`
  - `k6`

选择理由：

- 前后端与 worker 分离能避免把长耗时 Agent 调用绑死在 Web 请求线程上，适合高并发和真实生产场景。
- `Fastify + NestJS` 兼顾性能、结构化分层和团队可维护性。
- `Temporal` 适合多 Agent 协作里的长链路流程、并行调度、失败重试、补偿与状态恢复，避免后续从简易队列迁移到 durable workflow。
- `PostgreSQL + Redis + object storage` 是成熟、标准且可长期演进的组合。
- 保留 `workspace / permission` 演进空间，比先做单用户临时模型再迁移更稳妥。

## Commands

以下命令是本项目后续实现阶段必须对齐的目标命令，即使当前仓库尚未初始化：

```bash
pnpm install
pnpm dev
pnpm build
pnpm lint
pnpm test
pnpm test:unit
pnpm test:integration
pnpm test:e2e
pnpm test:load
pnpm db:migrate
pnpm db:seed
docker compose -f infra/docker/compose.dev.yml up -d postgres redis temporal minio
docker compose -f infra/docker/compose.dev.yml down
```

建议补充的 workspace 定向命令：

```bash
pnpm --filter web dev
pnpm --filter api dev
pnpm --filter worker dev
pnpm --filter web build
pnpm --filter api test
pnpm --filter worker test
```

## Project Structure

源需求没有禁止前后端分离，因此仓库目标结构采用生产常见的多应用单仓模式：

```text
AgentHub_multiagentcowork/
├─ SPEC.md
├─ ai/
│  ├─ specs/                      # 版本化 spec
│  ├─ plans/                      # 技术计划
│  ├─ tasks/                      # 任务拆解
│  ├─ rules/                      # 协作约束与规则
│  └─ logs/                       # AI 协作记录
├─ docs/
│  ├─ product/
│  ├─ architecture/
│  └─ operations/
├─ apps/
│  ├─ web/                        # Next.js Web client
│  ├─ api/                        # NestJS + Fastify API server
│  └─ worker/                     # Temporal workers / async orchestration
├─ packages/
│  ├─ contracts/                  # Shared schemas and DTOs
│  ├─ agent-sdk/                  # Unified agent interface
│  ├─ agent-adapters/             # Hermes / OpenClaw / Codex / Claude Code adapters
│  ├─ tool-runtime/               # Tool registry and execution runtime
│  ├─ domain/                     # Domain services and shared business logic
│  ├─ ui/                         # Shared UI components
│  └─ config/                     # ESLint / TS / Tailwind / test presets
├─ db/
│  ├─ migrations/
│  └─ seeds/
├─ infra/
│  ├─ docker/
│  ├─ k8s/
│  └─ observability/
└─ tests/
   ├─ integration/
   ├─ e2e/
   └─ load/
```

## Functional Requirements

### 1. IM Chat Experience

- 左侧展示会话列表
- 支持新建会话、归档、搜索、按最近活跃排序
- 支持在多个会话之间切换，且每个会话保留独立上下文
- 每条消息至少支持：文本、代码块、图片、文件附件、引用、重新生成、复制代码、展开预览

### 2. Single-Agent Conversation

- 用户创建新会话时可指定目标 Agent
- Agent 回复需基于当前会话完整历史与 pin 的长期上下文
- 用户可继续追问、要求修改、基于历史消息迭代

### 3. Group Chat and Orchestration

- 同一会话中可包含多个 Agent
- 用户可通过 `@agent-name` 显式指定响应方
- 当用户未明确指定时，Orchestrator 负责拆解任务并选择子 Agent
- Orchestrator 需要记录至少以下状态：已接收任务、已分派、执行中、部分失败、已汇总
- 支持并行调度
- 子 Agent 失败时应有降级路径，例如重试、改派、超时终止、以错误卡片反馈给用户

### 4. Agent Integration

- 所有 Provider 必须走统一适配器接口
- 首轮正式交付必须真实接入以下 Provider：
  - `Hermes`
  - `OpenClaw`
  - `Codex`
  - `Claude Code`
- 开发和前期测试允许在相同 contract 下切换 mock adapters
- Agent 在 UI 中表现为独立联系人，包含头像、名称、能力标签

### 5. Custom Agent System

- 支持轻量级自建 Agent：保存配置并在会话中选用
- 支持重度自建 Agent：接入完整工具链扩展
- Release 1 中，重度自建 Agent 以开发者配置文件或服务端注册为主
- 后续版本必须补齐重度自建 Agent 的可视化管理界面
- 工具链扩展必须走统一 `tool registry / tool runtime` 机制，不能把自定义工具逻辑散落在各个 Provider adapter 内

### 6. Artifact Preview

- 聊天流中支持内联展示产物卡片
- 至少支持代码块、网页预览卡片、文件附件卡片、基础 Diff 卡片
- 用户可以展开卡片查看详情
- 代码二次编辑、版本历史、一键部署发布不属于 Release 1

## Non-Functional Requirements

### Scalability and Performance

- 系统必须支持水平扩展，Web、API、Worker 可独立扩容
- 长耗时 Agent 任务不得阻塞同步请求线程
- 基线性能目标：
  - 发送消息后的平台确认响应 `p95 < 300ms`，不含上游 Provider 生成耗时
  - 会话列表读取 `p95 < 200ms`
  - Orchestrator 任务进入已分派状态 `p95 < 1s`
- 初始生产容量目标：
  - 支持至少 `3000` 个并发连接客户端
  - 支持至少 `500` 个并发 Agent 执行流
- 以上容量目标作为首个生产版本的固定目标；如需上调，必须在后续规划阶段显式调整

### Durability and Recovery

- 会话、消息、Artifact 元数据必须持久化
- Worker 重启后，进行中的编排任务应可恢复或重新调度
- 关键消息 `pin` 必须持久保存，并参与后续上下文拼装

### Security and Isolation Readiness

- 虽然 Release 1 不做登录与权限，但核心模型必须具备未来按 `workspace` 和 `member` 进行作用域隔离的设计空间
- Provider 凭据不得暴露给浏览器
- 敏感配置必须走服务端密钥管理或环境配置
- Release 1 固定为 `BYOK only`，并提供尽可能傻瓜化的录入、校验、绑定和错误提示流程
- 凭据域模型必须预留 `credential_source = user_provided | platform_managed` 的扩展能力，即使 Release 1 只启用 `user_provided`

### Observability

- API、Worker、Provider 调用链必须可追踪
- 关键编排状态需要结构化日志和指标
- Provider 错误、超时、重试和降级必须可观测

## Code Style

约定：

- 统一使用 `TypeScript`
- 文件与目录命名使用 `kebab-case`
- React 组件使用 `PascalCase`
- 控制器、服务、仓储、适配器、工作流分层明确
- 所有外部输入都先过 `zod` 或等价 schema 校验
- UI 层不允许直接依赖任何具体 Provider SDK
- Tool runtime、agent adapter、orchestrator workflow 必须保持边界清晰

风格示例：

```ts
import { z } from "zod";

const createConversationSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  mode: z.enum(["direct", "group"]),
  agentIds: z.array(z.string()).min(1),
});

export async function createConversation(input: unknown) {
  const parsed = createConversationSchema.parse(input);

  return conversationRepository.create({
    title: parsed.title ?? "New Conversation",
    mode: parsed.mode,
    agentIds: parsed.agentIds,
    workspaceId: DEFAULT_WORKSPACE_ID,
  });
}
```

以上示例体现的规则：

- 入口先校验，后执行业务
- repository 负责持久化，service 负责流程编排
- 即使 Release 1 不开放多工作区，数据模型也不能写成无扩展位的单租户死结构

## Testing Strategy

### Unit Tests

- 使用 `Vitest`
- 覆盖对象：
  - Orchestrator 状态流转与任务拆解
  - Agent adapter contract normalization
  - 消息 schema / artifact schema
  - 上下文拼装与 pin 逻辑
  - Tool registry / tool runtime

### Integration Tests

- 使用 `Vitest` 或 `Supertest`
- 覆盖对象：
  - API 与 PostgreSQL / Redis / Temporal 的集成
  - 会话创建、消息持久化、历史查询
  - 真实 adapter 与 mock adapter 的 contract 一致性

### End-to-End Tests

- 使用 `Playwright`
- 核心场景：
  - 创建单聊并收到 Agent 回复
  - 创建群聊并触发 Orchestrator 分派
  - 切换多个会话后历史消息仍保持正确
  - pin 一条消息后，下一轮请求仍携带该上下文
  - 创建一个轻量级自建 Agent 并在会话中选用
  - 至少一个产物卡片可展开查看

### Real Provider Acceptance Tests

- 首轮正式交付前，必须跑通以下真实 Provider：
  - `Hermes`
  - `OpenClaw`
  - `Codex`
  - `Claude Code`
- 这些测试不能被 mock 替代

### Load Tests

- 使用 `k6`
- 至少验证：
  - 会话列表读取压力
  - 发送消息压力
  - 并发 Agent 编排压力
  - 流式消息连接稳定性

## Boundaries

- Always:
  - 保持原始 `.docx` 只读，不在其上直接改写需求
  - 保持前端、后端、worker 分层，不把长链路编排塞回同步请求中
  - 所有 Provider 接入都通过统一 adapter interface
  - 正式交付时必须使用真实 `Hermes / OpenClaw / Codex / Claude Code`
  - Release 1 的 Provider 凭据模式固定为 `BYOK only`
  - 架构必须预留 `platform_managed` Provider 凭据模式的扩展位
  - 把登录、工作区、权限、共享会话记录为“延期但强制补齐”的能力
  - 在仓库中维护 `ai/specs`、`ai/plans`、`ai/tasks`、`ai/rules`、`ai/logs`
  - 每个实现任务都要附带验证方式

- Ask first:
  - 更换核心架构方向，例如取消前后端分离或取消独立 worker
  - 更换 durable workflow 方案
  - 降低真实 Provider 接入要求
  - 把延期但强制补齐的能力改成可选项
  - 引入新的重型基础设施组件

- Never:
  - 以 mock-only 形式完成正式交付
  - 在浏览器暴露 Provider 凭据
  - 在 UI 层直接调用具体 Provider SDK
  - 因为 Release 1 不做权限，就把未来的 workspace / permission 演进空间做死
  - 修改需求来源 `.docx` 的内容

## Success Criteria

### Release 1 Success Criteria

1. 用户能在 Web 界面创建并切换多个会话。
2. 用户能发起单聊，并收到基于上下文的 Agent 回复。
3. 用户能在同一会话中拉起多个 Agent，并通过 `@` 或 Orchestrator 完成一次群聊协作。
4. 聊天流支持至少以下结构化内容：代码块、预览卡片、附件卡片、基础 Diff 卡片。
5. 平台支持轻量级自建 Agent，并能在聊天中实际使用。
6. 平台具备工具扩展运行时，能够为重度自建 Agent 留下可执行扩展路径。
7. 会话历史、消息记录、pin 上下文刷新后仍然存在。
8. Web、API、Worker 架构可独立启动、独立测试、独立扩容。
9. 仓库内存在完整的 AI 协作记录目录结构。

### Formal Delivery Acceptance Criteria

1. `Hermes`、`OpenClaw`、`Codex`、`Claude Code` 四个 Provider 全部完成真实接入。
2. 四个真实 Provider 至少各自通过一条端到端会话验证链路。
3. 正式交付环境不依赖 mock adapter 才能演示核心能力。
4. 延期能力已在仓库中被清楚记录，后续开发不会把它们视为“没有要求”。
5. 用户自带 Provider 凭据的接入流程可以被非开发者按指引完成。

## Open Questions

当前无阻塞性开放问题。
