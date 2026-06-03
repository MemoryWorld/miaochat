# UI / UX 设计规格

## 1. 设计目标

用户应该把 Miaochat 频道理解成“人类和 AI 同事共同工作的房间”，但系统内部要把每个动作解释清楚：

- 谁说了话。
- 为什么这个 agent 被触发。
- 它看到了哪些上下文。
- 它是否在 handoff、调用工具、等待审批。
- 系统为什么阻止了继续响应。

## 2. 频道页布局

```text
┌──────────────────────────────────────────────────────────────┐
│ Channel Header                                                │
│ title, status, active chain, pause all, settings              │
├──────────────┬───────────────────────────────────┬───────────┤
│ Participants │ Event Timeline                    │ Inspector │
│              │                                   │           │
│ TechLead     │ human message                     │ selected  │
│ Engineer     │ agent turn bubble                 │ event /   │
│ Reviewer     │ handoff card                      │ turn /    │
│ QA           │ tool plan card                    │ chain     │
│              │ loop guard banner                 │ detail    │
├──────────────┴───────────────────────────────────┴───────────┤
│ Composer: @agent autocomplete, role chips, attachments         │
└──────────────────────────────────────────────────────────────┘
```

## 3. Participants panel

每个 participant 显示：

- avatar
- display name
- role label
- status badge
- current turn if running
- tool scope indicator
- mute button
- inspect button

状态：

| 状态 | 文案 | UI |
| --- | --- | --- |
| available | 空闲 | grey dot |
| queued | 排队 | clock |
| thinking | 思考中 | spinner |
| waiting_approval | 等待审批 | yellow badge |
| muted | 已静音 | muted icon |
| error | 失败 | red badge |

## 4. Event timeline

### 4.1 User message bubble

显示：

- author
- timestamp
- mentions chips
- reply target

### 4.2 Agent message bubble

必须显示 reason label：

| reason | UI label |
| --- | --- |
| human_mention | 因你点名 |
| human_role_mention | 因角色点名 |
| agent_handoff | 因任务交接 |
| reply_to_agent | 因被回复 |
| manual_retry | 手动重试 |
| scheduled_followup | 计划跟进 |

每个 agent bubble 操作：

- View context
- View trace
- Ask follow-up
- Request review
- Convert to task
- Save as memory candidate
- Mark stale

### 4.3 Handoff card

```text
TechLead -> Engineer
Goal: 实现同源 API proxy 修复
Acceptance:
  - API e2e pass
  - Web chat test pass
  - curl /health returns 200
Status: accepted / running / completed
```

操作：

- accept
- reject
- reassign
- inspect payload
- pause target turn

### 4.4 Tool plan card

```text
Engineer proposes tool plan
Risk: medium
Tools:
  - read files
  - edit conversations.service.ts
  - run vitest
Expected side effects:
  - local code changes
Rollback:
  - revert patch before commit
```

操作：

- approve
- deny
- edit
- require explanation

### 4.5 LoopGuard banner

示例：

```text
系统已暂停 Engineer 与 Reviewer 的连续互相回应。
原因：同一对 agent 已连续 ping-pong 3 次。
你可以：继续一次 / 总结当前讨论 / 暂停 Reviewer / 结束本链路
```

## 5. Inspector panel

点击任意 bubble / card 后显示 detail。

### 5.1 Event detail

- event id
- type
- author
- causal chain id
- parent event id
- provenance
- structured payload

### 5.2 Turn detail

- turn id
- triggering event
- reason
- status
- budget
- runtime policy
- context snapshot link
- produced events
- error if any

### 5.3 Context snapshot detail

显示 source refs：

| Source | Included | Tokens | Reason |
| --- | --- | --- | --- |
| role contract | yes | 300 | always |
| triggering event | yes | 80 | always |
| recent history | yes | 1200 | within budget |
| private memory | no | 0 | no relevant memory |
| quarantined memory | no | 0 | blocked |

## 6. Composer

### 6.1 Mention autocomplete

输入 `@` 后：

- agent names
- role names
- all-agents special item

每项显示：

- name
- role
- availability
- cost/risk hint

`@all-agents` 必须二次确认：

```text
这会触发 4 个 AI 同事并消耗更多预算。继续？
```

### 6.2 Send options

发送按钮旁边提供 mode：

| 模式 | 行为 |
| --- | --- |
| Ask | 只触发被点名 agent |
| Discuss | 允许 handoff 和有限 agent-to-agent |
| Execute | 允许工具计划，但高风险需审批 |
| Silent note | 只写入频道，不触发 agent |

## 7. Agent settings

新增 tab：`Channel Interaction`

字段：

- Respond to human mentions
- Respond to role mentions
- Respond to agent handoffs
- Allow agent-origin mentions
- Max turns per chain
- Cooldown seconds
- Recent history size
- Private memory enabled
- Tool risk level
- Must ask before
- Stop conditions

## 8. Run / Trace 页面

Trace 页面用 causal chain 展示：

```text
evt_user_1
  -> turn_techlead_1
      -> evt_handoff_1
          -> turn_engineer_1
              -> evt_tool_plan_1
              -> evt_tool_result_1
              -> evt_agent_message_1
                  -> turn_reviewer_1
```

节点颜色：

- green completed
- yellow waiting approval
- red failed
- grey skipped
- purple handoff

## 9. Empty states

### 9.1 没有 agent

```text
这个频道还没有 AI 同事。
添加 Tech Lead / Engineer / Reviewer，或从编码模式模板创建一组同事。
```

按钮：

- Add AI teammate
- Use coding team template

### 9.2 没有事件

```text
发一条消息并 @ 一个 AI 同事开始协作。
```

示例 chip：

- `@TechLead 帮我拆任务`
- `@Reviewer 看看这个方案有什么风险`

## 10. Accessibility

- 所有状态 badge 必须有文本。
- 不能只用颜色表示风险。
- timeline event 支持键盘导航。
- inspector 可通过 Enter 打开。
- loading 状态必须有 aria label。

## 11. UI tests 必须覆盖

文件建议：

```text
apps/web/src/features/chat/multi-agent-channel.spec.tsx
apps/web/src/features/chat/agent-turn-inspector.spec.tsx
apps/web/src/features/chat/handoff-card.spec.tsx
apps/web/src/features/chat/loop-guard-banner.spec.tsx
```

测试清单：

1. 输入 `@TechLead` 出现 autocomplete。
2. 发送 human mention 后只出现 TechLead queued/running。
3. agent bubble 显示 reason label。
4. handoff card 显示 source、target、acceptance criteria。
5. loop guard banner 出现后可以点击 summarize。
6. participant mute 后状态变 muted。
7. muted agent 不显示 queued。
8. context inspector 显示 source refs。
9. `@all-agents` 出现二次确认。
10. silent note 不触发 agent 状态变化。
