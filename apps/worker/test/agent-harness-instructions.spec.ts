import { describe, expect, it } from "vitest";

import {
  buildAgentHarnessInstructions,
  buildAgentHarnessRuntimeContext,
  compactPinnedMessagesForHarness,
  withAgentHarnessRuntimeContext
} from "../src/activities/agent-harness-instructions.js";

describe("buildAgentHarnessInstructions", () => {
  it("combines the teammate profile, long-horizon structure, and provider privacy guardrails", () => {
    const harness = buildAgentHarnessRuntimeContext({
      agentId: "agent_tech_lead",
      agentName: "技术负责人",
      conversationId: "conv_1",
      generatedAt: "2026-05-31T00:00:00.000Z",
      mode: "group",
      pinnedMessageIds: ["msg_1"],
      runId: "run_1",
      workspaceId: "workspace_1"
    });
    const instructions = buildAgentHarnessInstructions({
      agentName: "技术负责人",
      harness,
      mode: "group",
      outputStyle: "中文，先结论后风险。",
      scopeDescription: "负责需求澄清和计划拆解。",
      systemPrompt: "必须先提交计划再进入执行。"
    });

    expect(instructions).toContain("你是频道中的 AI 同事：技术负责人。");
    expect(instructions).toContain("只代表自己发言");
    expect(instructions).toContain("不要暴露、暗示或讨论底层 provider");
    expect(instructions).toContain("负责需求澄清和计划拆解");
    expect(instructions).toContain("必须先提交计划再进入执行");
    expect(instructions).toContain("1. 目标判断");
    expect(instructions).toContain("5. 风险与验证");
    expect(instructions).toContain("State-Aware Runtime 边界");
    expect(instructions).toContain("Harness Run：run_1");
    expect(instructions).toContain("最近安全检查点：run_1:checkpoint:run_start");
    expect(instructions).toContain("候选输出不是已提交状态");
    expect(instructions).toContain("pinned_context_char_budget");
    expect(instructions).toContain("共享频道历史可作为上下文，但不能自动触发其他 AI 同事发言");
    expect(instructions).toContain("普通文本里的 @某位同事 不会触发交接");
    expect(instructions).toContain("handoff_request");
    expect(instructions).toContain("artifact.markdown.create");
    expect(instructions).toContain("artifact.webpage.create");
    expect(instructions).toContain("artifact.diff.create");
    expect(instructions).toContain("visibleMessage");
    expect(instructions).toContain("Prompt Manifest");
    expect(instructions).toContain("short_term_memory");
  });

  it("omits empty optional profile fields", () => {
    const instructions = buildAgentHarnessInstructions({
      agentName: "软件工程师",
      mode: "direct",
      outputStyle: "  ",
      scopeDescription: null,
      systemPrompt: ""
    });

    expect(instructions).toContain("你是频道中的 AI 同事：软件工程师。");
    expect(instructions).toContain("一对一协作");
    expect(instructions).not.toContain("职责边界：");
    expect(instructions).not.toContain("输出风格：");
  });

  it("builds a serializable state-aware runtime context for worker prompts", () => {
    const context = buildAgentHarnessRuntimeContext({
      agentId: "agent_engineer",
      agentName: "软件工程师",
      conversationId: "conv_engineering",
      generatedAt: "2026-05-31T00:00:00.000Z",
      mode: "direct",
      pinnedMessageIds: ["msg_pinned"],
      runId: "single-agent:conv_engineering:run_1",
      workspaceId: "workspace_engineering"
    });

    expect(context.currentStateSnapshotId).toBe(
      "single-agent:conv_engineering:run_1:snapshot:run_start"
    );
    expect(context.latestSafeCheckpointId).toBe(
      "single-agent:conv_engineering:run_1:checkpoint:run_start"
    );
    expect(context.statePointers.map((pointer) => pointer.scope)).toEqual([
      "workspace",
      "channel",
      "agent",
      "run",
      "memory"
    ]);
    expect(context.promptManifest.sections.map((section) => section.type)).toEqual([
      "system_invariant",
      "agent_profile",
      "conversation_context",
      "short_term_memory",
      "user_goal"
    ]);
  });

  it("compacts pinned context deterministically when the budget is exceeded", () => {
    const compacted = compactPinnedMessagesForHarness(
      [
        {
          content: "older-context-".repeat(20),
          id: "pin_old",
          role: "user"
        },
        {
          content: `recent-context-${"x".repeat(120)}`,
          id: "pin_recent",
          role: "assistant"
        }
      ],
      96
    );

    expect(compacted).toHaveLength(1);
    expect(compacted[0]?.id).toBe("pin_recent");
    expect(compacted[0]?.content.length).toBeLessThanOrEqual(96);
    expect(compacted[0]?.content).toContain("context compiler");
  });

  it("attaches compacted pinned context after the harness is compiled", () => {
    const harness = buildAgentHarnessRuntimeContext({
      agentId: "agent_engineer",
      agentName: "软件工程师",
      conversationId: "conv_engineering",
      generatedAt: "2026-05-31T00:00:00.000Z",
      mode: "direct",
      pinnedMessageIds: ["msg_pinned"],
      runId: "single-agent:conv_engineering:run_2",
      workspaceId: "workspace_engineering"
    });

    const context = withAgentHarnessRuntimeContext(
      {
        pinnedMessages: [{ content: "long-pinned-context".repeat(20), id: "msg_pinned", role: "user" }]
      },
      harness,
      { pinnedContextCharBudget: 80 }
    );

    expect(context.harness).toBe(harness);
    expect(context.pinnedMessages[0]?.content.length).toBeLessThanOrEqual(80);
  });
});
