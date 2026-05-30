# Spec Snapshot: Phase C Built-In Agent Coding Workspace

## Status

Drafted on `2026-05-28` after:

- validating the current Chinese-first shell direction
- reviewing the product gap versus the reference product
- deciding that raw provider names must disappear from the customer-facing
  product model

This spec supersedes the earlier shell-only Phase C snapshot as the active
product direction. It still preserves the current runtime substrate.

## Assumptions I'm Making

1. The product remains a web application built on the current
   `web -> api -> worker -> runtime` architecture.
2. The customer-facing product is Chinese-first only for now. No bilingual i18n
   program starts in this phase.
3. Customers should interact with `AI 同事`, `工作区`, `频道`, `任务`, and
   `编码会话`, not with `Codex`, `Claude Code`, `Hermes`, or `OpenClaw` as
   first-class UX objects.
4. The previously explored enhanced Hermes direction
   (`morph-labs/hermes-agent-fork`) is the preferred base runtime for built-in
   agents because it is more suitable for a unified internal runtime than the
   older Hermes shim path.
5. A prior Claude Code codebase will be provided later by the user. Until that
   source exists in the repo, Claude-based built-in agent work remains a spec
   and integration target, not an implementation task.
6. The next product loop should focus on one opinionated job-to-be-done first:
   `编码`.
7. The current `Phase A` runtime path is still useful as infrastructure, but it
   should move behind the product and stop shaping the main UX language.

## Objective

Transform `Miaochat` into a Chinese-first AI software workforce product where a
customer logs into a workspace, chooses what they want to accomplish, and
receives a ready-made team of built-in AI colleagues who can plan, execute,
review, and validate work together.

The first complete experience is:

> 用户进入工作区 -> 选择“我要编码” -> 系统推荐一组默认 AI 角色 ->
> 用户确认目标 -> 技术负责人先产出计划并请用户确认 -> 工程师执行 ->
> Reviewer 审查 -> QA 验证 -> 结果和审批痕迹都留在同一工作区时间线里。

## Product Target

### 1. 产品主实体

用户看到的主实体必须是：

- 工作区
- 工作模式
- AI 同事
- 频道
- 任务
- 编码会话
- 审批

用户不应该先理解 provider、API key、adapter、runtime transport。

### 2. 首个主工作模式

首发只聚焦一个强路径：

- `编码`

后续可扩展但当前不进入实现的模式：

- 文档
- 运营
- 研究
- 客服

### 3. 默认内置团队

当用户选择 `编码` 时，系统默认推荐一支内置 AI 团队：

1. `技术负责人`
   - 职责：澄清目标、拆解范围、提出计划、管理风险、向用户请求确认
   - 行为参考：类似 Codex plan mode，但产品内不暴露 Codex 名称
2. `软件工程师`
   - 职责：实现功能、修改代码、提交变更说明
3. `代码评审`
   - 职责：审查改动、指出风险、要求修正、给出通过意见
4. `测试工程师`
   - 职责：设计验证路径、执行测试、回报缺陷、确认回归结果

这四个角色是产品模板，不是 provider 标签。

### 4. 用户自定义 AI 同事

除了默认团队，用户可以：

- 新增 AI 同事
- 设定中文名称、头像、角色描述、职责边界
- 选择其所在工作模式
- 选择是否可参与计划、执行、评审、测试、审批建议

自定义入口是产品能力，但不应暴露底层 runtime 细节给普通用户。

## Product Experience

### 登录后第一屏

登录后第一屏不再是 provider setup，也不再是空聊天页。

第一屏应该是：

- 工作区欢迎区
- “你想在这个工作区完成什么？”
- 主要工作模式卡片
- 最近任务 / 最近频道 / 最近会话

首发只需要把 `编码` 做成最强主按钮，其他模式可以先显示为
`即将开放`。

### 编码模式启动流程

1. 用户点击 `编码`
2. 系统打开 `启动编码工作流` 面板
3. 用户填写：
   - 本次目标
   - 相关仓库或上下文
   - 优先级
   - 是否需要截止时间
4. 系统展示推荐团队：
   - 技术负责人
   - 软件工程师
   - 代码评审
   - 测试工程师
5. 用户可以：
   - 直接开始
   - 调整团队成员
   - 添加自定义 AI 同事
6. 工作流启动后，先由 `技术负责人` 产出计划
7. 用户批准计划后，系统转入执行阶段

### 计划与执行闭环

产品需要明确展示以下阶段：

- 需求澄清
- 计划待确认
- 执行中
- 评审中
- 测试中
- 待用户确认
- 已完成

这些状态应该是工作区语言，不是纯技术 workflow 术语。

## Runtime And Agent Architecture

## Runtime Principle

运行时仍然保留分层：

`web -> api -> worker -> internal agent runtime`

但是产品层要做两件事：

1. provider 名称下沉到内部实现层
2. built-in AI teammate 上浮到产品层

## Internal Runtime Registry

引入内部概念：

- `built_in_agent_profile`
- `runtime_backend`
- `work_mode_template`

### runtime_backend

这是内部层，不暴露给普通用户。初始目标：

1. `enhanced-hermes`
   - 基于 `morph-labs/hermes-agent-fork`
   - 作为首选统一 agent runtime
2. `claude-code-internal`
   - 等用户提供旧源码后接入
   - 用于补足编码类 agent 的执行能力

`codex/openclaw/legacy hermes` 在后续阶段只允许作为兼容底座或过渡层，
不应继续出现在主产品叙事里。

## Built-In Agent Profiles

每个内置 AI 同事应具备：

- `id`
- `displayName`
- `role`
- `mission`
- `defaultWorkMode`
- `instructionProfile`
- `runtimeBackend`
- `toolPolicy`
- `approvalPolicy`
- `visibilityPolicy`

示例：

- `tech_lead`
- `software_engineer`
- `code_reviewer`
- `qa_tester`

## Tooling Model

内置 AI 同事需要基于角色获得工具权限，而不是一律全开。

示例默认策略：

- 技术负责人
  - 读上下文
  - 产出计划
  - 不直接提交高风险改动
- 软件工程师
  - 读写代码
  - 运行构建和测试
  - 生成变更摘要
- 代码评审
  - 读取 diff
  - 给出审查结论
  - 不直接合入
- 测试工程师
  - 运行测试
  - 记录缺陷
  - 回写验证结论

## Approval Model

以下动作默认进入人工确认：

- 技术负责人提交计划进入执行
- 对关键文件的大规模修改
- 部署相关操作
- 删除性操作
- 高风险配置变更

审批结果必须进入可见时间线。

## Commands

当前阶段制定和后续落地主要依赖：

```bash
pnpm --filter web test
pnpm --filter web build
pnpm --filter api build
pnpm --filter worker build
pnpm exec vitest run tests/integration/phase-a-runtime-baseline.spec.ts
pnpm exec vitest run apps/web/src/app/agents/page.spec.tsx
pnpm exec vitest run apps/web/src/features/chat/chat-experience.spec.tsx
pnpm exec vitest run apps/web/src/features/setup/setup-flow.spec.tsx
```

后续进入内置 agent 实施后，应新增：

```bash
pnpm exec vitest run tests/integration/built-in-agent-roles.spec.ts
pnpm exec vitest run tests/integration/coding-workflow-template.spec.ts
pnpm exec vitest run apps/web/src/features/workmodes/*.spec.tsx
pnpm exec vitest run apps/web/src/features/teammates/*.spec.tsx
```

## Project Structure

本 spec 预计主要影响：

```text
apps/web/src/app/                 登录后入口、工作模式页、AI 同事页、任务页
apps/web/src/features/chat/       从聊天视图演进为频道/会话/审批时间线
apps/web/src/features/agents/     从 agent registry 演进为 AI 同事管理
apps/web/src/features/setup/      从主入口降级为高级设置与管理员入口
apps/web/src/features/workmodes/  新增：工作模式选择与启动器
apps/web/src/features/tasks/      新增：任务状态与看板
apps/api/src/modules/             teammate/workmode/task/session APIs
apps/worker/src/                  内置角色编排、审批关口、执行阶段管理
packages/contracts/               built-in teammate / work mode / task schemas
packages/agent-adapters/          底层 runtime backend 适配层
docs/product/                     中文产品说明与角色定义
docs/architecture/                内置 agent runtime 与审批模型
ai/specs/ ai/plans/ ai/tasks/     本 milestone 的规范控制文件
```

## Code Style

所有面向用户的一层文案，默认使用中文产品语言，避免 provider 词汇漏出：

```tsx
<section className="grid gap-3">
  <h2 className="text-2xl font-semibold text-slate-950">选择工作模式</h2>
  <p className="text-sm leading-7 text-slate-600">
    先告诉我们你要完成什么，系统会为你准备合适的 AI 同事和执行流程。
  </p>
</section>
```

实现原则：

- 主导航使用产品实体，不使用底层 provider 实体
- 角色名称与状态名称统一中文
- 页面先表达“工作目标”和“协作角色”，再表达“运行时来源”
- runtime backend 相关文案只允许出现在管理员设置或调试视图

## Testing Strategy

### Web

- 工作模式入口测试
- 推荐团队渲染测试
- 计划待确认状态测试
- 审批卡片测试
- 自定义 AI 同事表单测试
- provider 名称不泄漏到主产品壳层的测试

### Integration

- 选择 `编码` 后生成默认角色团队
- 技术负责人先产出计划
- 用户确认后软件工程师进入执行
- Reviewer 和 QA 顺序回写结果
- 审批与状态事件落在同一时间线

### Runtime Compatibility

- 既有 `Phase A` runtime baseline 在过渡期持续通过
- enhanced Hermes backend 可以承载至少一类 built-in coding role
- future Claude backend 接入时必须通过同一角色契约测试

## Boundaries

- Always:
  - 保持中文优先
  - 隐藏 provider 概念于产品第一层之外
  - 保留当前 runtime substrate，避免一次性推倒重来
  - 让技术负责人先计划、用户后确认，不能直接跳过
  - 在 `ai/logs` 里记录每次关键方向调整和重大 bug
- Ask first:
  - 引入新的数据库主实体
  - 修改认证模式
  - 新增第三方 UI 框架
  - 在普通用户界面重新暴露 provider 名称
  - 将 Claude 旧源码并入当前仓库的具体方式
- Never:
  - 把 `Codex / Claude Code / Hermes / OpenClaw` 作为普通客户必须理解的产品概念
  - 把 `/setup` 继续当成默认首页叙事
  - 在未获得用户确认前让执行型 agent 自动推进高风险动作
  - 直接照抄参考产品的品牌资产、图标、文案或视觉素材

## Success Criteria

当以下条件成立时，这个方向算真正落地：

1. 登录后第一步是选择工作模式，而不是绑定 provider。
2. `编码` 模式可以一键生成默认 AI 团队。
3. 技术负责人会先给出计划，并进入用户确认环节。
4. 软件工程师、代码评审、测试工程师的角色边界清晰可见。
5. 用户可以自定义 AI 同事，而不必理解底层 provider。
6. 时间线能同时展示计划、执行、评审、测试、审批。
7. 增强版 Hermes 成为内置 runtime 的首选方向。
8. 未来 Claude 运行时可以作为内部 backend 接入同一 built-in role
   contract。

## Deferred Scope

当前明确后置，不混入本阶段交付：

- 英文版产品
- 多工作模式同时完整上线
- 公开 provider marketplace
- 面向普通用户的 provider 选择器
- Claude internal runtime 的具体实现
- 所有外部集成（GitHub、Linear、邮件、会议）的完整接入

## Open Questions

1. `编码` 模式是否应该在启动前要求绑定仓库，还是先允许纯需求描述启动？
2. 内置 `技术负责人` 的计划卡是否要支持用户逐条批准，还是一次性批准？
3. 自定义 AI 同事是直接从默认模板复制，还是从空白角色创建？
4. `enhanced-hermes` 和未来 `claude-code-internal` 的职责边界如何拆分：
   - 一个负责计划
   - 一个负责执行
   - 还是都实现完整角色契约，由调度器分配？
5. 频道、任务、编码会话三者是否需要独立持久化实体，还是先继续兼容
   `conversation` 模型？
