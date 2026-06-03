# Miaochat vs Helio 页面走查与产品工程报告

日期：2026-05-30
对象：Helio 最新桌面 app 与本地 `http://localhost:3000/` SaaS
本地 SaaS 暂称：Miaochat（来自浏览器标题与页面品牌）
走查方式：使用 Computer Use 在 Helio 与 Google Chrome 本地页面中逐页切换、观察页面结构、交互入口、空状态、状态一致性、信息架构与可实现性。
安全边界：没有执行创建、删除、邀请、付款、保存凭据、提交表单等不可逆操作。

## 1. 总结

Miaochat 的方向是有亮点的。它不像 Helio 那样只是把“人、频道、任务、日历、文件、AI 队友”做成一套协作工具，而是进一步尝试把“工作模式、AI 同事组合、运行策略、记忆范围、凭据绑定”显性化。这个方向更适合做一个 AI 编排型 SaaS，尤其适合开发者、运营团队、交付团队这类需要多 AI 角色协作的场景。

但当前 Miaochat 最大的问题是：产品页面更像“架构说明书”或“概念原型”，而不是一个高频使用的协作工作台。页面里大量文案在解释设计意图，组件面积偏大，导航层级重复，很多功能停留在占位或空状态。相比之下，Helio 的页面虽然也有不足，但它的核心页面更像真实工具：收件箱有过滤和详情区，任务页有看板/列表、搜索、筛选和创建入口，日历有真实时间网格，频道页有消息输入器、附件、格式、表情、成员、通知、置顶等操作。

最优先需要修的是两个状态一致性问题：频道文件页 `?tab=files` 会丢失频道上下文，显示成通用“频道”并把 AI 同事数量变成 0；设置页的工作区选择器显示 `Phase A Demo Workspace`，但页面内容多处显示 `default-workspace`。这两个问题会让用户不信任系统的数据作用域。

## 2. Helio 作为蓝本的核心逻辑

Helio 的产品结构可以概括成一个“协作操作系统”：

| 层级 | Helio 做法 | 对 Miaochat 的启发 |
| --- | --- | --- |
| 全局壳层 | 紧凑左侧栏，包含工作区、Inbox、Tasks、Calendar、Channels、AI teammates、DM、账户与在线状态 | 高频产品的主壳层应该省空间、少解释、强操作 |
| 收件箱 | 按全部、任务、日历、审批过滤，有列表区和详情区 | 收件箱不是说明页，而是待处理队列 |
| 任务 | 看板/列表、显示已关闭时间窗、搜索、状态/优先级/负责人筛选、创建任务 | 即使空数据，也应该保留真实任务系统的操作骨架 |
| 日历 | 月/周/日视图、今天/上一个/下一个、迷你日历、关注日历、事件入口、真实时间网格 | 日历页必须是时间工具，不应该只是“统一时间视图”的概念说明 |
| 频道 | 聊天/文件标签、成员、通知、置顶、频道操作、系统事件、消息输入器 | 频道页是工作的主现场，需要压缩解释性内容，强化消息与活动流 |
| AI 队友 | 每个 AI 队友拥有 chat、tasks、activity、calendar、channels、files、skills、memory、settings 等子页 | AI 不只是聊天对象，而是有任务、技能、记忆和设置的 actor |
| 设置 | 个人资料、更新、工作区、成员、API credentials、账单、marketplace | 管理页应该承载配置，但不应该污染日常工作流 |

Helio 的优秀之处不是视觉更复杂，而是它把每个页面都做成了一个稳定的“工具面板”。Miaochat 当前的页面更多是在告诉用户“这个系统将来会如何工作”，而不是让用户立刻完成一个动作。

## 3. Miaochat 全局壳层评估

### 3.1 当前观察

Miaochat 的全局页面顶部有品牌 `MIAOCHAT`、大标题 `AI 协作工作空间` 和说明文案“把收件箱、任务、日历、频道和 AI 同事统一留在同一个空间里。”右侧有“账户与管理”折叠区，展开后提供个人资料、工作区设置、高级凭据设置。左侧是大卡片式导航：工作台、收件箱、任务、日历、频道、设置，并有“新建同事”入口和当前工作区选择器。

这个壳层更像 landing page 与 SaaS shell 的混合体。它有明确的产品表达，但对高频操作不够节制。

### 3.2 对比 Helio 的不足

| 问题 | 当前表现 | 为什么影响使用 |
| --- | --- | --- |
| 顶部 Hero 过重 | 每个页面都保留大标题和说明文案 | 用户进入任务、日历、频道后，首屏空间被品牌解释占用 |
| 导航卡片过大 | 左侧每个入口都有标题和副标题 | 初次理解友好，但长期使用效率低 |
| 账户与设置重复 | 顶部“账户与管理”和左侧“设置”都通往设置子页 | 信息架构重复，用户不知道哪个是主入口 |
| 工作区状态不一致 | 选择器显示 `Phase A Demo Workspace`，设置页内容显示 `default-workspace` | 破坏用户对作用域、数据隔离、权限边界的信任 |
| 视觉层级太均匀 | 大圆角卡片、胶囊按钮、说明文字大量重复 | 重要操作和解释文字的权重接近，用户难以扫视 |

### 3.3 建议实现

把全局壳层拆成两种形态：

| 壳层 | 使用场景 | 实现建议 |
| --- | --- | --- |
| `OnboardingShell` | 未配置、首次引导、产品介绍页 | 可以保留大标题、说明、模式介绍 |
| `WorkspaceShell` | 登录后的日常工作页 | 顶部高度控制在 48 到 64px，左侧导航只保留图标、名称、徽标数量和必要状态 |

工程上建议：

- 建立单一 `WorkspaceContext`，所有页面、设置分区、频道 loader、凭据页都从同一个 active workspace 读取。
- 路由 loader 不要各自 fallback 到 `default-workspace`，fallback 只能发生在登录初始化层。
- 顶部品牌说明只在工作台或 onboarding 露出，其他页面只显示当前页面标题和主操作。
- 导航项副标题可以改成 hover tooltip 或首次使用提示，而不是永久占用空间。

## 4. 页面级对照

### 4.1 工作台 `/`

#### 当前观察

工作台同时承载了身份信息、当前频道、工作模式、推荐 AI 同事、频道列表、聊天时间线、文件标签、置顶入口、流状态和消息输入器。页面中有“先选择你要推进的工作”，当前主模式是“编码”，并推荐四个 AI 同事：技术负责人、软件工程师、代码评审、测试工程师。页面还预留了文档、运营、研究、客服等未来模式。

#### 相比 Helio 的不足

| 不足 | 具体表现 | 影响 |
| --- | --- | --- |
| 工作台过载 | 模式选择、频道列表和频道聊天都在同一页 | 用户不知道当前主任务是“选模式”还是“进频道工作” |
| 频道路由职责不清 | 首页嵌入了当前频道聊天，频道页也有聊天 | 同一对象有两个入口，状态同步和心智模型都会变复杂 |
| 解释多于操作 | 多个模块在解释“为什么这样设计” | 降低了真实工作推进速度 |
| 未来模式像未完成 | 文档、运营、研究、客服只是占位 | 对外展示时容易被理解为功能未做完 |
| 连接状态不清楚 | “连接中”持续显示，但没有说明连接到什么、是否可用 | 用户无法判断是否应该等待、刷新或重试 |

#### 创新点

“先选工作模式，再进入协作”是 Miaochat 很好的创新。Helio 的 AI 队友虽然结构成熟，但它没有把“这次我要做编码/文档/研究/客服”作为顶层工作模式来组织队友组合。Miaochat 如果把工作模式做实，可以成为比 Helio 更强的 AI 编排入口。

#### 建议实现

工作台应从“综合大杂烩”改成“启动器 + 当前状态”：

| 模块 | 保留方式 |
| --- | --- |
| 工作模式 | 保留，但压缩成一行或一个启动卡片，点击后打开模式选择器 |
| 推荐 AI 同事 | 保留，但只显示当前模式下可用组合和“开始协作”按钮 |
| 频道列表 | 保留最近频道和继续入口，不要在首页完整复制频道页 |
| 当前聊天 | 移到频道页，工作台只显示“继续上次会话”摘要 |
| 未来模式 | 未上线前收进“更多模式即将支持”，不要作为同等入口展示 |

建议数据模型：

```ts
type WorkMode = {
  id: string;
  name: string;
  description: string;
  recommendedAgentIds: string[];
  defaultChannelTemplateId?: string;
  capabilityIds: string[];
  status: "active" | "coming_soon" | "disabled";
};
```

### 4.2 收件箱 `/inbox`

#### 当前观察

页面标题是“把需要你判断的事项集中到一起”，说明审批、流程进展、失败摘要和重要更新会进入这里。当前显示共 0 条、待处理 0 条，并有空状态提示。

#### Helio 蓝本

Helio 的收件箱虽然也为空，但它具备完整工具结构：全部、任务、日历、审批过滤，左侧队列区域，右侧详情区域，“全部标为已读”和筛选入口。它让用户知道这里未来会成为一个真实的处理队列。

#### Miaochat 不足

| 不足 | 具体表现 | 影响 |
| --- | --- | --- |
| 缺少真实队列骨架 | 只有指标和说明，没有过滤、详情、批处理入口 | 用户无法形成“这里处理待办”的操作预期 |
| 说明文案太长 | 页面在解释 inbox 的概念 | 对高频页面而言信息密度偏低 |
| 空状态没有下一步 | 没有引导用户创建任务、进入频道、配置通知来源 | 空页面停在“这里以后会有东西” |

#### 建议实现

Inbox 应该按事件类型与处理状态建模：

```ts
type InboxItem = {
  id: string;
  workspaceId: string;
  type: "mention" | "approval" | "task_update" | "calendar_update" | "agent_failure" | "credential_alert";
  status: "unread" | "read" | "resolved" | "snoozed";
  sourceType: "channel" | "task" | "calendar" | "agent" | "system";
  sourceId: string;
  actorId?: string;
  title: string;
  summary: string;
  createdAt: string;
  action?: {
    label: string;
    href: string;
  };
};
```

页面结构建议：左侧筛选与队列，中间列表，右侧详情与操作。空状态应该给出“去频道发起一次协作”“查看失败运行”“配置通知来源”等明确下一步。

### 4.3 任务 `/tasks`

#### 当前观察

页面标题是“一个任务系统，多个作用域”，说明工作区、频道和 AI 同事页面会复用同一个任务系统。页面提供“看板”和“列表”按钮，但当前没有任务，也没有明显创建、筛选、搜索或详情能力。

#### Helio 蓝本

Helio 的任务页有看板/列表切换、显示已关闭时间窗、任务数量、创建任务、搜索、状态筛选、优先级筛选、负责人筛选。即使没有数据，也能看出这是一个真实任务系统。

#### Miaochat 不足

| 不足 | 具体表现 | 影响 |
| --- | --- | --- |
| 任务页像架构说明 | “一个任务系统，多个作用域”是工程设计语言 | 用户想看到“我的任务”，不是系统复用策略 |
| 看板/列表未体现差异 | 切换后没有足够可见变化 | 容易被认为是假按钮或半成品 |
| 缺少任务创建入口 | 没有主按钮创建任务 | 用户无法从页面启动工作 |
| 缺少任务过滤 | 没有状态、负责人、优先级、搜索 | 不具备真实团队协作的扩展性 |

#### 建议实现

把标题改成用户任务语言，例如“任务”或“所有任务”。复用作用域可以隐藏在筛选器里：

| 控件 | 建议 |
| --- | --- |
| 范围 | 全部、工作区、频道、AI 同事、我负责 |
| 视图 | 列表、看板 |
| 过滤 | 状态、优先级、负责人、截止日期 |
| 操作 | 新建任务、批量更新、导出或复制链接 |

任务系统可按 scope 复用：

```ts
type TaskScope =
  | { type: "workspace"; workspaceId: string }
  | { type: "channel"; channelId: string }
  | { type: "agent"; agentId: string }
  | { type: "user"; userId: string };

type Task = {
  id: string;
  workspaceId: string;
  scope: TaskScope;
  title: string;
  status: "todo" | "in_progress" | "blocked" | "review" | "done" | "archived";
  priority: "low" | "medium" | "high" | "urgent";
  assigneeIds: string[];
  dueAt?: string;
  sourceMessageId?: string;
};
```

### 4.4 日历 `/calendar`

#### 当前观察

页面标题是“统一的时间视图”，说明同一套日历视图会被工作区和 AI 同事页面复用。页面有“月视图、周视图、日视图”按钮，但当前只是空状态，没有真实日历网格。

#### Helio 蓝本

Helio 的日历页是完整工具：今天、上一个、下一个、月/周/日切换、迷你月历、搜索日历、我的日历、关注队友日历、真实时间网格、时区显示和事件入口。

#### Miaochat 不足

| 不足 | 具体表现 | 影响 |
| --- | --- | --- |
| 不像日历 | 没有日期网格、时间轴或具体日期导航 | 用户无法进行时间规划 |
| 复用逻辑外露 | 文案强调“同一套视图复用” | 这是工程实现，不是用户价值 |
| 缺少创建事件 | 没有 `+ 事件` 或从任务生成日程入口 | 不能闭环时间管理 |

#### 建议实现

最低可用版本应包含：

- 月、周、日三种真实网格视图。
- 今天、上一段、下一段导航。
- 创建事件入口。
- 我的日历和 AI 同事日历的开关。
- 从任务或频道消息生成事件的入口。

建议模型：

```ts
type CalendarEvent = {
  id: string;
  workspaceId: string;
  calendarId: string;
  title: string;
  startsAt: string;
  endsAt: string;
  attendeeIds: string[];
  sourceType?: "manual" | "task" | "channel_message" | "agent_plan";
  sourceId?: string;
};
```

### 4.5 频道总览 `/channels/overview`

#### 当前观察

页面标题是“共享上下文先进入频道”。页面列出 3 个频道：`Phase A Group Orchestration`、`Phase A Direct Conversation`、`Phase A Artifact Review`。每个卡片显示 AI 同事数量、更新时间，并提供 `Open channel` 和 `View files` 入口。

#### 相比 Helio 的不足

Helio 的频道入口更紧凑，频道作为左侧一级对象直接进入工作现场。Miaochat 的频道总览更适合管理和发现，但它缺少搜索、新建频道、归档、成员过滤、最近活动排序等操作。

#### 创新点

“共享上下文先进入频道”这个表达是正确的。它比把 AI 配置、文件、审批分散在不同 provider 页面更清晰。Miaochat 把频道定义为协作上下文容器，这一点和 Helio 的方向一致，也适合后续承载多 agent 协作。

#### 建议实现

频道总览应该成为频道管理页面，而不是重复首页频道列表：

| 能力 | 建议 |
| --- | --- |
| 搜索 | 按频道名、成员、最近消息搜索 |
| 创建 | 新建频道，选择公开/私有、默认 AI 同事 |
| 过滤 | 活跃、归档、我参与、含失败运行 |
| 排序 | 最近活动、创建时间、未读数、AI 同事数 |
| 快捷动作 | 打开聊天、查看文件、复制链接、管理成员 |

### 4.6 频道聊天 `/channels/conv_phase_a_group`

#### 当前观察

频道页显示 `Phase A Group Orchestration`，副标题是“2 位协作成员共享这个频道”。页面有聊天和文件标签，统计 AI 同事 2、审批 0、活动轮次 0、流状态“连接中”。时间线里有 AI 同事消息、用户消息、@mention，以及 AI 同事执行失败摘要，例如 Hermes 和 OpenClaw 的任务失败。消息输入器允许选择 `@hermes-demo-planner` 和 `@openclaw-demo-operator`。

#### Helio 蓝本

Helio 的频道页更像 Slack/Discord 型工作现场：频道标题、成员、通知、置顶、频道操作、聊天/文件标签、欢迎卡、系统事件、消息输入器、附件、格式工具、表情、提及和发送选项。它的操作层级更成熟。

#### Miaochat 不足

| 不足 | 具体表现 | 影响 |
| --- | --- | --- |
| 内部术语外露 | 页面标签出现“频道壳层” | 用户不需要知道 shell/container 概念 |
| 失败摘要缺少恢复动作 | 失败块只说明 failed/timed out | 用户不知道是否重试、换 provider、查看日志或降级 |
| 流状态不明确 | “连接中”持续显示 | 不能判断是连接正常、正在重连还是卡住 |
| 消息操作过重 | 每条消息都有 Pin message | 操作权重过高，时间线显得吵 |
| Composer 状态不够清楚 | 选择 AI 同事后缺少强状态反馈和可用性提示 | 多 agent 输入器的优势没有完全释放 |

#### 创新点

这里是 Miaochat 最接近“超过 Helio”的地方。Helio 有 AI 队友和频道，但 Miaochat 直接把多个 AI 同事放进同一个频道，并把运行失败作为时间线事件暴露出来。这对工程型 SaaS 很有价值，因为用户不仅需要 AI 输出，还需要知道哪个 agent 失败了、为什么失败、下一步怎么恢复。

#### 建议实现

频道时间线应明确区分事件类型：

```ts
type ChannelTimelineEvent =
  | { type: "message"; message: ChannelMessage }
  | { type: "system"; event: SystemEvent }
  | { type: "agent_run_started"; run: AgentRun }
  | { type: "agent_run_completed"; run: AgentRun }
  | { type: "agent_run_failed"; run: AgentRun; recoveryActions: RecoveryAction[] };

type RecoveryAction = {
  label: string;
  kind: "retry" | "view_logs" | "switch_provider" | "open_credentials" | "create_task";
  href?: string;
};
```

失败事件建议提供：

| 动作 | 用途 |
| --- | --- |
| 重试 | 对超时、临时网络失败最直接 |
| 查看日志 | 面向技术用户排查 provider/runtime |
| 修改凭据 | 关联到 credentials 页面 |
| 切换运行策略 | 例如从 Hermes 切到 OpenClaw 或平台托管 |
| 创建任务 | 把失败恢复交给人或 AI 同事处理 |

### 4.7 频道文件 `/channels/conv_phase_a_group?tab=files`

#### 当前观察

这是最严重的问题之一。进入文件标签后，页面丢失了频道上下文：标题变成通用“频道”，说明变成“这个频道会统一承载聊天、文件、审批和活动上下文”，AI 同事数量变成 0，工作区状态显示 `default-workspace`，而不是 `Phase A Demo Workspace`。

#### 问题等级

建议按 P0 或 P1 处理。原因是它不是单纯 UI 文案问题，而是 route state 或 loader hydration 问题。用户从同一个频道的聊天切到文件，系统却像进入了另一个空频道，这会直接影响信任。

#### 可能原因

| 可能原因 | 说明 |
| --- | --- |
| query tab 改变后 loader 没有重新带入 channelId | `?tab=files` 分支使用默认 channel state |
| channel 数据只在 chat tab 初始化 | files tab 未调用同一个 channel loader |
| workspace context fallback | 找不到 workspace 时 fallback 到 `default-workspace` |
| route path 与 query state 重复管理 | tab 状态和实体状态耦合不清 |

#### 建议实现

频道页应当先解析频道实体，再渲染 tab：

```ts
async function loadChannelPage(params: { channelId: string; tab?: string }) {
  const workspace = await requireActiveWorkspace();
  const channel = await getChannel({
    workspaceId: workspace.id,
    channelId: params.channelId,
  });

  if (!channel) {
    throw new Response("Channel not found", { status: 404 });
  }

  return {
    workspace,
    channel,
    activeTab: normalizeChannelTab(params.tab),
  };
}
```

需要补充 e2e 测试：

```ts
test("channel files tab keeps channel context", async ({ page }) => {
  await page.goto("/channels/conv_phase_a_group");
  await expect(page.getByRole("heading", { name: "Phase A Group Orchestration" })).toBeVisible();

  await page.goto("/channels/conv_phase_a_group?tab=files");
  await expect(page.getByRole("heading", { name: "Phase A Group Orchestration" })).toBeVisible();
  await expect(page.getByText("2 位协作成员共享这个频道")).toBeVisible();
});
```

### 4.8 设置首页 `/settings`

#### 当前观察

设置页标题是“设置与管理”，分区包括个人资料、工作区、成员、凭据、账单、能力市场。整体结构清楚，但仍有较多说明文案。

#### Helio 蓝本

Helio 的设置页包含个人资料、更新、工作区、成员、API credentials、账单、Marketplace 等分区。Helio 更像真实管理后台，Miaochat 更像配置蓝图。

#### Miaochat 不足

| 不足 | 具体表现 | 影响 |
| --- | --- | --- |
| 设置入口重复 | 顶部账户与管理、左侧设置、设置页内部再次分区 | 用户路径过多 |
| 管理概念混杂 | 工作区、凭据、账单、能力市场都在同一层 | 后续功能增多后容易失控 |
| 文案仍偏解释 | “集中在设置页”这类说明较多 | 设置页应该以配置项和状态为主 |

#### 建议实现

设置可以分为三组：

| 分组 | 内容 |
| --- | --- |
| 账户 | 个人资料、登录、安全、通知 |
| 工作区 | 基本信息、成员、权限、账单 |
| AI 平台 | 凭据、运行策略、能力市场、记忆策略、审计日志 |

### 4.9 个人资料设置

#### 当前观察

个人资料显示当前身份 `Phase A Demo Operator` 和邮箱 `phase-a-demo@example.com`，并提供退出登录。

#### 不足

功能偏薄，只能确认登录状态。相比 Helio，缺少姓名、头像、偏好、连接账号、通知偏好等真实账户配置。

#### 建议实现

个人资料应至少包含：

- 姓名、头像、邮箱。
- 语言、时区、主题。
- 通知偏好。
- 已连接账号。
- 会话与安全设置。

### 4.10 工作区设置 `/settings?section=workspace`

#### 当前观察

工作区设置里显示当前 workspace ID 为 `default-workspace`，但左侧或全局选择器显示当前工作区是 `Phase A Demo Workspace`。

#### 问题等级

建议 P0/P1。工作区是 SaaS 的数据隔离边界。如果 UI 在不同位置显示两个 workspace，用户会怀疑数据是否写错租户。

#### 建议实现

建立强约束：

- 当前 workspace 只能由 `WorkspaceProvider` 提供。
- 所有 settings section 必须依赖同一个 `activeWorkspace.id`。
- 后端 API 请求必须显式传 `workspaceId` 或从 session active workspace 推导，不能在组件层写死 fallback。
- 在开发环境中，如果出现 `default-workspace` fallback，应显示 dev warning 或抛错，而不是静默展示。

### 4.11 成员设置 `/settings?section=members`

#### 当前观察

成员页把人类成员和 AI 成员放在同一个目录里。人类成员包括 `Phase A Demo Operator`，AI 成员包括技术负责人、软件工程师、代码评审、测试工程师、OpenClaw Demo Operator、Hermes Demo Planner、Hermes Demo Direct。

#### 创新点

这个方向是对的。把 AI 同事当作 workspace member，而不是只当插件或 bot，有利于统一权限、任务分配、频道成员、日历归属和审计。

#### 相比 Helio 的不足

Helio 的成员管理更接近真实 SaaS 成员表。Miaochat 当前成员页虽然概念清楚，但缺少邀请成员、角色权限、状态、最后活跃时间、停用、转移所有权等管理能力。

#### 建议实现

成员模型建议统一 human 与 agent，但能力不同：

```ts
type WorkspaceMember = {
  id: string;
  workspaceId: string;
  actorType: "human" | "agent";
  actorId: string;
  role: "owner" | "admin" | "member" | "viewer" | "agent";
  status: "active" | "invited" | "disabled";
  joinedAt: string;
  lastActiveAt?: string;
};
```

### 4.12 凭据设置 `/settings?section=credentials`

#### 当前观察

凭据页是 Miaochat 的强项。页面支持 provider 切换：Codex、Claude Code、Hermes、OpenClaw。支持 credential mode：Bring your own key 和 Platform-managed。选中 Hermes 后显示 credential label、provider account identifier、provider secret、expected prefix `hermes_`、Validate credential、Save and bind、状态 `AWAITING VALIDATION`、Bound credentials 等。

#### 创新点

相比 Helio 的 API credentials 更偏常规添加凭据，Miaochat 的 provider-specific validation 更清楚。它显式告诉用户：不同 AI 运行时需要不同凭据，凭据需要验证后才能绑定。这对企业场景、BYOK 场景、开发者工具场景都很关键。

#### 不足

| 不足 | 具体表现 | 影响 |
| --- | --- | --- |
| 概念混在一起 | Codex、Claude Code、Hermes、OpenClaw 可能既像 provider 又像 runtime/tool | 用户不清楚自己在配置模型、工具、执行器还是账号 |
| 英中混排较多 | Bring your own key、Platform-managed、AWAITING VALIDATION 等 | 专业但不够统一 |
| 工作区 ID 错误 | 页面显示 `default-workspace` | 凭据是高风险配置，作用域错会非常严重 |
| 保存禁用原因不清 | `Save and bind` disabled，但没有明确原因 | 用户不知道要先验证、补字段还是权限不足 |
| 文案面积偏大 | provider 卡片和说明较多 | 配置效率下降 |

#### 建议实现

先把概念拆清楚：

| 概念 | 含义 |
| --- | --- |
| Provider | OpenAI、Anthropic、Google、Azure 等账号/模型提供方 |
| Runtime | Codex CLI、Claude Code、Hermes、OpenClaw 等执行环境 |
| Credential | 某 provider 或 runtime 所需的 secret |
| Binding | 把 credential 绑定到 workspace、agent 或 runtime policy |
| Policy | 何时使用哪个 runtime，失败后如何 fallback |

凭据状态机建议：

```ts
type CredentialStatus =
  | "draft"
  | "awaiting_validation"
  | "validating"
  | "validated"
  | "validation_failed"
  | "bound"
  | "revoked";
```

按钮禁用原因应显式展示：

```ts
type DisabledReason =
  | "missing_label"
  | "missing_secret"
  | "not_validated"
  | "workspace_mismatch"
  | "insufficient_permission";
```

### 4.13 账单 `/settings?section=billing`

#### 当前观察

账单页目前是占位，提示“暂未接入完整账单面板”。

#### Helio 蓝本

Helio 的账单页已经有 Basic、Pro、Max、Ultra 等计划与 usage 展示。它更像一个可商业化 SaaS 的账单页。

#### Miaochat 不足

当前账单页不足以支持真实客户判断成本、套餐、额度、用量、发票或付款状态。

#### 建议实现

至少需要：

- 当前套餐。
- 已用额度与剩余额度。
- AI provider 成本拆分。
- workspace 成员数与 AI 同事数对账。
- 发票、付款方式、升级入口。
- BYOK 模式与平台托管模式的费用差异说明。

### 4.14 能力市场 `/settings?section=marketplaces`

#### 当前观察

能力市场按能力域组织：计划与审批、实现与交付、评审与风险控制、验证与回归、记忆同步。

#### 创新点

这比 Helio 当前 marketplace 更贴近用户价值。Helio 的 marketplace 更像源管理，例如 `anthropic-agent-skills`、`heliohq`、`knowledge-work-plugins`。Miaochat 从“能力”而不是“来源”组织，用户更容易理解“我要给 AI 同事补什么能力”。

#### 不足

当前页面还没有真正的安装、启用、版本、权限、来源、风险提示、适配对象等能力。它现在更像能力分类说明。

#### 建议实现

能力市场应该同时保留用户视角和工程视角：

| 用户视角 | 工程视角 |
| --- | --- |
| 能力名称 | package/source |
| 适合谁 | compatible agent roles |
| 能解决什么 | capability manifest |
| 需要哪些权限 | permission scope |
| 安装/启用状态 | installed/enabled/version |
| 风险提示 | data access/audit |

### 4.15 新建 AI 同事 `/teammates/new`

#### 当前观察

新建 AI 同事是六步向导：模板、身份、范围、能力、运行策略、确认。模板包括技术负责人、软件工程师、代码评审、测试工程师、交付协同、研究协同。身份步骤提供名称、职责说明、头像 URL。范围步骤提供默认工作模式和频道/工作区范围。能力步骤提供技能标签和记忆模式。运行策略步骤默认“增强版 Hermes 首选路径”。确认步骤会显示技术负责人、工作模式、记忆模式 `workspace + actor`、高级策略和技能信息，并提示后续会接入更细的 channel membership、skills 和 memory persistence。

#### Helio 蓝本

Helio 的创建 AI 队友流程更偏模板市场与快速创建。它展示模板、provider/profile、加入频道等，但没有像 Miaochat 这样明确暴露 scope、memory、runtime strategy。

#### Miaochat 创新点

这是 Miaochat 的另一个强创新方向。AI 同事不是简单 bot，而是有职责、范围、技能、记忆策略和运行策略的 actor。这个设计更适合长期协作，也更容易和企业权限、审计、成本控制结合。

#### Miaochat 不足

| 不足 | 具体表现 | 影响 |
| --- | --- | --- |
| 六步过重 | 页面顶部六个巨大胶囊步骤占用大量空间 | 创建一个 AI 同事的心理成本偏高 |
| 模板选中状态不清 | 进入第二步后字段未明显由默认模板预填 | 用户不知道模板是否真的生效 |
| 禁用原因不清 | 最后创建按钮禁用，但没有明确告诉用户缺什么 | 阻塞完成 |
| 技术术语外露 | `custom_agents`、`workspace + actor`、Hermes 首选路径等 | 普通用户会被实现细节干扰 |
| 高级策略过早出现 | 运行策略对普通用户不是必填认知 | 创建流程显得复杂 |
| 页面说明重复 | 每一步都重复“先把目标、边界...” | 降低效率 |

#### 建议实现

创建流程建议拆成“简单模式”和“高级设置”：

| 模式 | 面向用户 | 包含字段 |
| --- | --- | --- |
| 简单创建 | 大多数用户 | 模板、名称、职责、加入频道、创建 |
| 高级设置 | 管理员/开发者 | 能力、记忆模式、运行策略、凭据绑定、权限 |

模板选择应该立即预填字段：

```ts
type AgentTemplate = {
  id: string;
  name: string;
  roleDescription: string;
  defaultSkills: string[];
  defaultMemoryPolicy: MemoryPolicy;
  defaultRuntimePolicyId?: string;
};

function applyTemplate(template: AgentTemplate) {
  setForm((draft) => ({
    ...draft,
    name: template.name,
    roleDescription: template.roleDescription,
    skills: template.defaultSkills,
    memoryPolicy: template.defaultMemoryPolicy,
  }));
}
```

最终确认页应显示用户语言，而不是内部字段：

| 当前 | 建议 |
| --- | --- |
| `workspace + actor` | “记住工作区上下文，并保留这位同事自己的长期记忆” |
| `custom_agents` | 不展示，或改为“AI 同事配置” |
| `增强版 Hermes 首选路径` | “优先使用高可靠执行路径，失败时自动降级” |

## 5. Miaochat 相比 Helio 的创新清单

| 创新 | 为什么重要 | 当前成熟度 |
| --- | --- | --- |
| 工作模式优先 | 用户先表达工作类型，再由系统推荐 AI 同事组合 | 方向强，但首页实现过重 |
| 多 AI 同事频道编排 | 一个频道内明确选择多个 AI 同事协作 | 很有潜力，composer 和失败恢复还需加强 |
| AI 运行失败可见 | 失败事件进入时间线，而不是静默失败 | 很重要，但缺少恢复动作 |
| BYOK 与 provider 验证流程 | 凭据验证、绑定、平台托管/自带密钥区分清楚 | 强创新，但概念需要拆清 |
| AI 同事创建包含范围、记忆、运行策略 | 比 Helio 更接近企业级 AI actor 管理 | 强创新，但应隐藏高级细节 |
| 能力市场按能力域组织 | 用户按“我需要什么能力”理解，而不是按源仓库理解 | 好方向，但还没形成真实 marketplace |
| 人类成员和 AI 成员同表 | 有利于权限、任务、频道、日历统一 | 正确方向，但管理能力不足 |

## 6. 核心不足清单

### 6.1 产品层不足

| 优先级 | 问题 | 建议 |
| --- | --- | --- |
| P0 | 频道文件 tab 丢失频道上下文 | 统一 channel loader，tab 只改变视图不改变实体 |
| P0 | workspace 显示不一致，出现 `default-workspace` | 建立单一 active workspace context，禁止组件 fallback |
| P1 | 任务和日历像占位页 | 先实现最小可用工具骨架，再写复用说明 |
| P1 | 工作台承担太多职责 | 改为启动器，聊天回到频道页 |
| P1 | 新建 AI 同事流程太重 | 简单创建优先，高级设置折叠 |
| P1 | 凭据页概念混杂 | 拆分 provider、runtime、credential、binding、policy |
| P2 | 全局 Hero 和大卡片导航占空间 | 登录后使用紧凑 workspace shell |
| P2 | 文案偏架构说明 | 改为用户动作、状态、下一步 |
| P2 | 技术术语外露 | 建立 product copy glossary |

### 6.2 工程层不足

| 问题 | 可能工程原因 | 建议 |
| --- | --- | --- |
| route tab 切换丢实体 | tab state 与 entity loader 耦合不清 | 父 route 加载 channel，子 tab 只渲染不同面板 |
| workspace 不一致 | 多处 hardcode 或 fallback | `WorkspaceProvider` 单一事实源 |
| 页面占位多 | 数据模型和 UI shell 先于业务闭环 | 按 vertical slice 完成任务/日历/频道闭环 |
| 创建向导状态不清 | 模板、表单、验证状态没有统一 | 使用 form state machine |
| 凭据保存禁用无解释 | validation 与 UI disabled reason 未建模 | 所有 disabled control 显示原因 |

## 7. 推荐的下一轮重构路线

### 7.1 第一阶段：修正可信度问题

目标是让用户相信当前页面显示的是正确 workspace 和正确频道。

- 修复 `/channels/:id?tab=files` 丢失频道上下文。
- 修复设置页 `default-workspace` 与 active workspace 不一致。
- 所有页面统一使用 active workspace。
- 增加 e2e 测试覆盖频道 tab、设置分区、凭据页 workspace 展示。
- 开发环境中如果发生 fallback workspace，直接抛错或显示明显 warning。

### 7.2 第二阶段：把说明页变成工具页

目标是让核心导航每一页都有真实操作骨架。

- Inbox 加入过滤、队列、详情、处理动作。
- Tasks 加入创建、搜索、筛选、看板/列表真实布局。
- Calendar 加入真实月/周/日网格和事件创建。
- Channels overview 加入搜索、创建、排序和快捷动作。
- Empty state 从“这里以后会有内容”改为“你现在可以做什么”。

### 7.3 第三阶段：释放 Miaochat 的创新

目标是把“AI 编排”做成区别于 Helio 的核心壁垒。

- 工作模式变成真正的启动器：选择模式后自动推荐 AI 同事组合、频道模板、任务模板。
- 多 AI 同事 composer 强化选中态、可用态、运行状态。
- 失败事件提供重试、查看日志、切换 provider、打开凭据、创建恢复任务。
- 新建 AI 同事支持简单创建和高级配置分层。
- 能力市场从分类说明升级为可安装、可启用、可审计的能力系统。

## 8. 建议的信息架构

Miaochat 可以保留自己的创新，但主导航要更像一个高频工具：

```text
WorkspaceShell
├── 工作台
│   ├── 当前工作模式
│   ├── 最近频道
│   ├── 待处理摘要
│   └── 开始协作
├── 收件箱
│   ├── 待处理队列
│   ├── 类型过滤
│   └── 详情动作
├── 任务
│   ├── 列表/看板
│   ├── scope 过滤
│   └── 创建任务
├── 日历
│   ├── 月/周/日
│   ├── 我的日历
│   └── AI 同事日历
├── 频道
│   ├── 频道总览
│   ├── 频道聊天
│   ├── 文件
│   └── 活动/审批
├── AI 同事
│   ├── 目录
│   ├── 新建
│   ├── 详情
│   └── 记忆/技能/运行策略
└── 设置
    ├── 账户
    ├── 工作区
    ├── 成员
    ├── 凭据
    ├── 账单
    └── 能力市场
```

## 9. UI 简洁化原则

| 当前倾向 | 建议方向 |
| --- | --- |
| 大标题解释产品 | 页面标题描述当前位置，说明文案减少到一句 |
| 大卡片导航 | 紧凑导航，关键状态用 badge |
| 每页重复系统理念 | 把理念收进帮助、空状态或 onboarding |
| 英中混杂 | 用户层中文，工程层英文，避免混在同一标签 |
| 技术字段直接展示 | 给普通用户展示意图，给高级用户展示实现 |
| 所有入口同权重 | 主操作高亮，次操作收进菜单 |
| 空状态只说明未来 | 空状态必须给下一步动作 |

## 10. 关键工程测试建议

### 10.1 路由与上下文测试

```ts
test("settings sections use active workspace", async ({ page }) => {
  await page.goto("/settings?section=workspace");
  await expect(page.getByText("Phase A Demo Workspace")).toBeVisible();
  await expect(page.getByText("default-workspace")).not.toBeVisible();
});

test("credentials page does not fall back to default workspace", async ({ page }) => {
  await page.goto("/settings?section=credentials");
  await expect(page.getByText("Phase A Demo Workspace")).toBeVisible();
  await expect(page.getByText("default-workspace")).not.toBeVisible();
});
```

### 10.2 创建 AI 同事测试

```ts
test("agent template prefills identity fields", async ({ page }) => {
  await page.goto("/teammates/new");
  await page.getByRole("button", { name: /软件工程师/ }).click();
  await page.getByRole("button", { name: "下一步" }).click();
  await expect(page.getByLabel("AI 同事名称")).toHaveValue("软件工程师");
});

test("disabled create button explains missing fields", async ({ page }) => {
  await page.goto("/teammates/new");
  await page.getByRole("button", { name: /确认/ }).click();
  await expect(page.getByText(/请补全/)).toBeVisible();
});
```

### 10.3 频道失败恢复测试

```ts
test("failed agent run offers recovery actions", async ({ page }) => {
  await page.goto("/channels/conv_phase_a_group");
  await expect(page.getByText(/failed/i)).toBeVisible();
  await expect(page.getByRole("button", { name: /重试|Retry/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /凭据|Credentials/ })).toBeVisible();
});
```

## 11. 最终判断

如果以 Helio 为蓝本，Miaochat 当前最需要补的是“工具成熟度”和“信息架构收敛”。Helio 强在每个页面都像一个能立即使用的工具，而 Miaochat 当前有太多页面还停留在解释“系统应该如何设计”。

但 Miaochat 不是简单落后。它在 AI 编排方向上有几处非常值得保留并放大的创新：工作模式驱动、多 AI 同事频道协作、运行失败可见、BYOK/provider 验证、AI 同事的范围/记忆/运行策略、能力市场按用户能力域组织。这些点如果打磨好，会让 Miaochat 不只是 Helio 的仿品，而是更偏“AI work orchestration platform”的产品。

下一步最好的策略不是继续加页面，而是先把现有页面变薄、变准、变可操作。先修上下文一致性，再把 Inbox、Tasks、Calendar 做成真实工具，最后把 AI 编排创新从“概念”变成“用户能一键完成的工作流”。
