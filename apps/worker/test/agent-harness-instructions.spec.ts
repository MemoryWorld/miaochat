import { describe, expect, it } from "vitest";

import { buildAgentHarnessInstructions } from "../src/activities/agent-harness-instructions.js";

describe("buildAgentHarnessInstructions", () => {
  it("combines the teammate profile, long-horizon structure, and provider privacy guardrails", () => {
    const instructions = buildAgentHarnessInstructions({
      agentName: "技术负责人",
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
});
