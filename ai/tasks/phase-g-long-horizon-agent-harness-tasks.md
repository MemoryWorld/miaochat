# Phase G: 长程协作 Agent Harness

## 目标

把 Miaochat 的 AI 同事从“把用户消息直接转发给模型 API”提升为可持续演进的 Agent Harness：

- 每个 AI 同事必须带着自己的职责、范围、输出风格和协作护栏进入真实模型调用。
- 频道里的多名 AI 同事必须能围绕同一个程序设计问题分别响应，而不是输出一条无身份的聚合文本。
- 长程任务必须沉淀计划、交接、验证和失败原因，让下一轮同事可以接着做。
- UI 必须让用户感觉自己在使用协作工作区，而不是静态聊天框。

## 资料来源与共识

### 公开资料

- OpenAI Harness Engineering: https://openai.com/index/harness-engineering/
  - 关键结论：仓库内文档、执行计划、决策日志要成为 agent 可读的系统事实来源；复杂工作要用版本化计划承载，而不是依赖外部聊天或人的记忆。
- OpenAI Agents SDK harness/sandbox: https://openai.com/index/the-next-evolution-of-the-agents-sdk/
  - 关键结论：可靠 agent 不只需要模型，还需要工具、记忆、沙箱、文件系统、指令和可控运行环境。
- OpenAI Practical Guide to Building Agents: https://cdn.openai.com/business-guides-and-resources/a-practical-guide-to-building-agents.pdf
  - 关键结论：agent 的基础由模型、工具、指令/护栏构成；要能识别完成、失败时停下并交还用户。
- Anthropic long-running harness: https://www.anthropic.com/engineering/harness-design-long-running-apps
  - 关键结论：长程 coding agent 需要任务拆分、结构化交接、planner/generator/evaluator 分离，避免上下文焦虑和自我评价过宽。
- Anthropic effective harnesses: https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents
  - 关键结论：initializer/coding agent 与跨会话工件可以让 agent 跨上下文窗口持续推进。
- Anthropic multi-agent research system: https://www.anthropic.com/engineering/multi-agent-research-system
  - 关键结论：lead agent 分解任务，subagents 并行探索，适用于多方向、重工具、超单上下文窗口的问题。
- 菜鸟教程 Harness Engineering: https://www.runoob.com/ai-agent/harness-engineering.html
  - 关键结论：Harness 的核心是约束、反馈回路、上下文工程、熵管理；失败不是换模型，而是补运行环境。

### 本地 openclaw / hermes 抽象

- OpenClaw 可借鉴点：
  - ACP bridge 把外部 IDE session 映射到 Gateway session。
  - 会话 key 可以绑定具体 agent，支持 reconnect/reset/cancel。
  - Gateway 负责持久化 session，桥接层只做协议翻译。
  - 工具流事件、usage/session info 通过统一事件回传。
- Hermes 可借鉴点：
  - profile 隔离：每个实例拥有独立 config、memory、sessions、skills。
  - gateway 多平台入口：一个 agent runtime 可以接 CLI、Telegram、Slack 等通道。
  - toolsets/skills/memory/checkpoint/trajectory compression 是 harness 的核心资产。
  - shadow git checkpoint 在写文件前透明快照，失败后可回滚。
  - trajectory compression 保护首尾关键 turns，中段压缩为结构化摘要。
- 不使用项：
  - `claude-code-main/` 被视为不可上传、不可复用的本地敏感参考目录。本阶段不读取、不复制其实现。

## 当前差距

- 自定义 AI 同事的 `systemPrompt` 已存入数据库，但 DeepSeek 真实调用没有使用它。
- 所有同事接近同一模型调用，缺少 role-specific instructions、handoff artifact、evaluator 反馈。
- 真实流式事件仍是 worker 完成后由 API 发布，尚未做到 worker activity 逐 token 推送。
- 工具权限、沙箱、文件系统检查点、可恢复长程任务还没有形成产品级闭环。
- 频道附件按钮仍是浏览器默认 input 样式，不符合当前 UI。

## Phase G 任务列表

### G1: 角色指令进入真实模型调用

- [x] API 查询 conversation agents 时带上 custom agent 的职责、范围、输出风格。
- [x] worker dispatch 时构造中文协作 harness instructions。
- [x] DeepSeek/OpenAI-compatible prompt messages 支持 system instructions。
- [x] direct/group 路径都使用同一套 harness instructions。

验收：

- [x] 单元测试覆盖 prompt message 顺序。
- [x] worker 测试覆盖 direct/group harness instructions。

### G2: 长程协作输出护栏

- [x] 每名 AI 同事输出时必须说明“目标判断、拆解、自己的建议、需要协作、风险与验证”。
- [x] 对复杂程序设计问题要求生成可交接的结构化结果，而不是只给一句回答。
- [x] 不暴露底层 provider 名称，只使用“AI 同事”语言。

验收：

- [x] helper 测试断言输出结构存在。

### G3: 多同事三题回归

- [x] 在集成测试中提出三个方向的程序设计问题。
- [x] 每个问题必须由多名 AI 同事分别回复并持久化。
- [x] 验证 `sourceAgentId` 排异，确保不是一条无身份聚合回复。

三题：

- 长程任务的上下文交接怎么设计？
- 工具执行权限和失败回滚怎么设计？
- 多 Agent 评审闭环怎么设计？

### G4: 附件按钮视觉统一

- [x] 移除浏览器默认文件选择按钮的突兀样式。
- [x] 改为与当前胶囊/卡片一致的按钮。
- [x] 保留键盘和屏幕阅读器可访问性。

### G5: 后续未完成项

- [ ] worker activity 直接向 StreamBroker 发布实时 token，而不是完成后批量回放。
- [ ] sandbox manifest：每个长程任务明确输入目录、输出目录、工具权限和凭证隔离。
- [ ] shadow checkpoint：文件写入/补丁执行前快照，失败可回滚。
- [ ] handoff artifact 持久化：每轮执行产生 `plan.md`、`handoff.md`、`verification.md`。
- [ ] evaluator agent：把评审/QA 从生成者中拆出来，形成 planner/generator/evaluator 闭环。
- [ ] doc-gardening agent：扫描文档与实现漂移，生成修复任务。

## 验证命令

- `pnpm --filter agent-adapters exec vitest run test/deepseek-adapter.spec.ts`
- `pnpm --filter worker exec vitest run test/agent-harness-instructions.spec.ts test/group-orchestrator.workflow.spec.ts test/single-agent.workflow.spec.ts`
- `pnpm exec vitest run tests/integration/group-orchestrator.spec.ts`
- `pnpm --filter web exec vitest run --config vitest.config.ts src/features/chat/chat-composer.spec.tsx src/features/channels/channel-shell.spec.tsx`
- `pnpm --filter web lint`
- `pnpm --filter web build`
- `pnpm --filter worker lint`
- `pnpm --filter worker build`

## 本轮执行记录

- 已完成 G1-G4 的第一条可运行竖切片：自定义 AI 同事画像进入真实模型调用、长程协作输出护栏、多同事三题回归、附件按钮视觉统一。
- 额外修复消息读取权限边界：从未加入频道的用户读取消息返回 404；曾加入后被移除的用户仍返回 403，避免泄露未知频道存在性同时保留移除态反馈。
- 验证通过：DeepSeek adapter 单测、worker harness/workflow 单测、web chat/channel 单测、group orchestrator 集成测试、messages/channel collaboration API 测试、api/worker/web/domain/sdk/adapters/contracts 构建。
- 已知非本轮阻塞：`api lint` 仍有 11 个既有 lint 错误；`contracts lint` 仍有 1 个既有 lint 错误。当前改动涉及的新增/修改文件已通过 `git diff --check`、构建和相关测试。

## 风险

- 真实 DeepSeek 网络波动仍可能导致某个同事失败；当前已能部分成功并给中文失败提示。
- 长程 harness 的核心护城河不是 prompt，而是可恢复执行、工具沙箱、检查点、评审闭环。本阶段只完成第一层竖切片。
- 多 Agent 并行会增加 token 成本，后续需要引入预算、超时和任务价值判断。
