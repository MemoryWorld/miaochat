import { describe, expect, it, vi } from "vitest";

import type { RuntimeArtifactDraft } from "@agenthub/contracts";

import {
  CodingWorkflowDispatchService,
  parseCodingStageVerdict
} from "../src/modules/coding-workflows/coding-workflow-dispatch.service.js";

describe("CodingWorkflowDispatchService", () => {
  it("retries a required webpage stage once with a structured artifact contract before failing the stage", async () => {
    const webpageArtifact: RuntimeArtifactDraft = {
      fileName: "date-calculator.html",
      html: "<!doctype html><html><body><h1>日期天数计算器</h1></body></html>",
      mimeType: "text/html",
      title: "日期天数计算器",
      type: "webpage"
    };
    const service = new CodingWorkflowDispatchService(
      { execute: vi.fn() } as never,
      {} as never,
      { publish: vi.fn() } as never
    );
    const executeSingleAgent = vi
      .fn()
      .mockResolvedValueOnce({
        finalContent: "我已创建网页，但没有给出可解析的 artifact。"
      })
      .mockResolvedValueOnce({
        artifacts: [webpageArtifact],
        finalContent: "网页已作为可预览 HTML artifact 生成。"
      });
    const persistWorkflowState = vi.fn(async () => undefined);
    const publishWorkflowStatus = vi.fn(async () => undefined);
    const loadConversationContext = vi.fn(async () => ({
      pinnedMessages: [],
      recentMessages: []
    }));
    const insertAssistantMessage = vi.fn(async () => undefined);
    const persistRuntimeArtifacts = vi.fn(async () => undefined);
    const publishAssistantMessageLifecycle = vi.fn();
    const completeLatestActivityRound = vi.fn(async () => undefined);
    const recordActorMemory = vi.fn(async () => undefined);
    Object.assign(service as never, {
      completeLatestActivityRound,
      executeSingleAgent,
      insertAssistantMessage,
      loadConversationContext,
      persistRuntimeArtifacts,
      publishAssistantMessageLifecycle,
      publishWorkflowStatus,
      recordActorMemory,
      persistWorkflowState
    });

    const result = await (service as never as {
      runStage: (input: unknown) => Promise<{
        artifacts: RuntimeArtifactDraft[];
        content: string;
      }>;
    }).runStage({
      activeAgentId: "agent_engineer",
      activeAgentName: "软件工程师",
      assistantMessageId: "msg_engineer",
      conversationId: "conv_workflow",
      currentTaskSnapshot: [
        {
          id: "execution:software_engineer",
          ownerRole: "software_engineer",
          state: "todo",
          title: "软件工程师按计划实现"
        }
      ],
      executionRoles: ["software_engineer", "code_reviewer", "qa_tester"],
      ownerUserId: "user_owner",
      planningRole: "tech_lead",
      prompt: "用户目标：生成日期天数计算器网页。",
      requiredArtifactType: "webpage",
      runtimeBackend: "enhanced-hermes",
      stageId: "execution:software_engineer",
      stageLabel: "coding.execution_started",
      stageTeammateId: "software_engineer",
      summary: "软件工程师正在根据已批准计划进行实现。",
      workflowId: "workflow_1",
      workflowState: "execution_running",
      workspaceId: "workspace_1"
    });

    expect(executeSingleAgent).toHaveBeenCalledTimes(2);
    expect(executeSingleAgent.mock.calls[1]?.[0].message).toContain("artifact.webpage.create");
    expect(executeSingleAgent.mock.calls[1]?.[0].message).toContain("我已创建网页，但没有给出可解析的 artifact。");
    expect(result.artifacts).toEqual([webpageArtifact]);
    expect(result.content).toBe("网页已作为可预览 HTML artifact 生成。");
    expect(insertAssistantMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        content: "网页已作为可预览 HTML artifact 生成。",
        id: "msg_engineer"
      })
    );
    expect(persistRuntimeArtifacts).toHaveBeenCalledWith(
      expect.objectContaining({
        artifacts: [webpageArtifact],
        failOnError: true,
        messageId: "msg_engineer"
      })
    );
    expect(completeLatestActivityRound).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "succeeded"
      })
    );
  });

  it("treats PASS and non-blocking review suggestions as pass instead of repair blockers", () => {
    expect(
      parseCodingStageVerdict(
        [
          "评审结论：实现贴合目标。",
          "非阻塞建议：后续可以补充更细的空态动效，不需要返修。",
          "结论：PASS"
        ].join("\n")
      )
    ).toEqual({
      blockers: [],
      severity: "none",
      status: "pass"
    });

    expect(
      parseCodingStageVerdict(
        [
          "覆盖新增、编辑、删除、完成和 localStorage。",
          "低风险建议：可在下一轮优化按钮文案。",
          "未发现高严重度阻塞项。"
        ].join("\n")
      )
    ).toEqual({
      blockers: [],
      severity: "none",
      status: "pass"
    });
  });
});
