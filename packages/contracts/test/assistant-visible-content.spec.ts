import { describe, expect, it } from "vitest";

import {
  sanitizeAssistantVisibleContent,
  stripInternalCollaborationArtifacts
} from "../src/assistant-visible-content.js";

describe("assistant visible content sanitization", () => {
  it("removes inline handoff control arrays appended to markdown content", () => {
    const markdown = [
      "## 技术方案",
      "",
      "| 模块 | 处理 |",
      "| --- | --- |",
      "| 交互层 | 保留用户可见说明 |",
      "",
      "下一步会继续拆分实现任务。"
    ].join("\n");
    const cleaned = sanitizeAssistantVisibleContent(`${markdown}
[{"type":"handoff_request","targetRoleKey":"builder","targetAgentId":"agent_builder","goal":"安排实现同事继续","acceptanceCriteria":["完成测试"],"constraints":["保持用户可配置"]},{"type":"handoff_request","targetRoleKey":"reviewer","goal":"安排复核","acceptanceCriteria":["完成复核"],"constraints":["不要改变用户可见正文"]}]`);

    expect(cleaned).toBe(markdown);
    expect(cleaned).not.toContain("handoff_request");
    expect(cleaned).not.toContain("targetRoleKey");
    expect(cleaned).not.toContain("constraints");
    expect(cleaned).not.toContain("acceptanceCriteria");
  });

  it("removes internal collaboration control JSON while keeping visible prose", () => {
    const cleaned = sanitizeAssistantVisibleContent([
      "我会先整理方案，并把下一步拆清楚。",
      "```json",
      JSON.stringify({
        acceptanceCriteria: ["完成测试"],
        constraints: ["保持用户可配置"],
        goal: "安排下一位同事继续",
        targetAgentId: "agent_builder",
        targetRoleKey: "builder",
        type: "handoff_request"
      }),
      "```"
    ].join("\n"));

    expect(cleaned).toBe("我会先整理方案，并把下一步拆清楚。");
    expect(cleaned).not.toContain("handoff_request");
    expect(cleaned).not.toContain("targetRoleKey");
    expect(cleaned).not.toContain("acceptanceCriteria");
  });

  it("uses envelope visibleMessage when the whole response is a control envelope", () => {
    const cleaned = sanitizeAssistantVisibleContent(JSON.stringify({
      intents: [
        {
          acceptanceCriteria: ["完成测试"],
          constraints: ["保持用户可配置"],
          goal: "安排下一位同事继续",
          targetRoleKey: "builder",
          type: "handoff_request"
        }
      ],
      visibleMessage: "我会先给出方案，再让实现同事继续。"
    }));

    expect(cleaned).toBe("我会先给出方案，再让实现同事继续。");
  });

  it("uses envelope visibleMessage when the response proposes artifact tools or memory updates", () => {
    const cleaned = sanitizeAssistantVisibleContent(JSON.stringify({
      intents: [
        {
          calls: [
            {
              idempotencyKey: "artifact:release-notes",
              input: {
                fileName: "release-notes.md",
                markdown: "# Release notes",
                title: "Release notes"
              },
              inputSchemaVersion: "1",
              toolName: "artifact.markdown.create"
            }
          ],
          expectedSideEffects: ["Create a downloadable Markdown artifact."],
          riskLevel: "low",
          summary: "Create the Markdown artifact requested by the user.",
          type: "tool_plan"
        },
        {
          memoryType: "private",
          summary: "Remember the user's preferred artifact format.",
          type: "memory_candidate"
        },
        {
          reason: "No handoff is needed.",
          type: "no_action"
        }
      ],
      visibleMessage: "我整理好了发布说明，并附上可下载的 Markdown。"
    }));

    expect(cleaned).toBe("我整理好了发布说明，并附上可下载的 Markdown。");
    expect(cleaned).not.toContain("tool_plan");
    expect(cleaned).not.toContain("artifact.markdown.create");
    expect(cleaned).not.toContain("memory_candidate");
    expect(cleaned).not.toContain("no_action");
  });

  it("removes appended artifact tool-plan envelopes while keeping visible prose", () => {
    const cleaned = sanitizeAssistantVisibleContent([
      "已完成发布说明。",
      JSON.stringify({
        intents: [
          {
            calls: [
              {
                idempotencyKey: "artifact:release-notes",
                input: {
                  markdown: "# Release notes",
                  title: "Release notes"
                },
                inputSchemaVersion: "1",
                toolName: "artifact.markdown.create"
              }
            ],
            riskLevel: "low",
            summary: "Create a Markdown artifact.",
            type: "tool_plan"
          }
        ],
        visibleMessage: ""
      })
    ].join("\n"));

    expect(cleaned).toBe("已完成发布说明。");
    expect(cleaned).not.toContain("artifact.markdown.create");
    expect(cleaned).not.toContain("tool_plan");
  });

  it("falls back to a natural visible message when only control JSON remains", () => {
    const cleaned = sanitizeAssistantVisibleContent(JSON.stringify({
      acceptanceCriteria: ["完成测试"],
      constraints: ["保持用户可配置"],
      goal: "安排下一位同事继续",
      targetAgentId: "agent_builder",
      type: "handoff_request"
    }));

    expect(cleaned).toBe("我会继续整理并推进这个任务。");
  });

  it("can remove visible transfer placeholders and internal control words for group turns", () => {
    const cleaned = sanitizeAssistantVisibleContent(
      "我将请另一位同事先梳理方案，稍后我会基于这些内容补充风险。 ORCHESTRATOR metadata handoff target",
      { stripCollaborationPlaceholders: true }
    );

    expect(cleaned).toBe("本步未生成可展示内容。");
    expect(cleaned).not.toContain("我将请");
    expect(cleaned).not.toContain("稍后");
    expect(cleaned).not.toContain("ORCHESTRATOR");
    expect(cleaned).not.toContain("metadata");
    expect(cleaned).not.toContain("handoff");
    expect(cleaned).not.toContain("target");
  });

  it("keeps substantive group content while removing trailing control words", () => {
    const cleaned = sanitizeAssistantVisibleContent(
      "MVP 范围：导入人体扫描、参数化护具、输出打印调校清单。 metadata handoff target",
      { stripCollaborationPlaceholders: true }
    );

    expect(cleaned).toBe("MVP 范围：导入人体扫描、参数化护具、输出打印调校清单。");
  });

  it("removes visible envelope placeholder labels from group replies", () => {
    const cleaned = sanitizeAssistantVisibleContent(
      [
        "已完成方案汇总，下一步可以进入验收。",
        "[envelope 内容]",
        "【tool_plan 内容】"
      ].join("\n"),
      { stripCollaborationPlaceholders: true }
    );

    expect(cleaned).toBe("已完成方案汇总，下一步可以进入验收。");
    expect(cleaned).not.toContain("envelope");
    expect(cleaned).not.toContain("tool_plan");
  });

  it("removes handoff-only visible messages in strict group mode", () => {
    const cleaned = sanitizeAssistantVisibleContent(
      "我会先给出方案，再让实现同事继续。",
      { stripCollaborationPlaceholders: true }
    );

    expect(cleaned).toBe("本步未生成可展示内容。");
  });

  it("does not remove ordinary JSON examples", () => {
    const content = [
      "可以按这个结构返回：",
      "```json",
      JSON.stringify({
        fields: ["name", "price"],
        targetRoleKey: "example-only",
        type: "demo_payload"
      }, null, 2),
      "```"
    ].join("\n");

    expect(stripInternalCollaborationArtifacts(content)).toBe(content);
  });
});
