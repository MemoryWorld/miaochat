import { describe, expect, it, vi } from "vitest";

import { MessageDispatchService } from "../src/modules/messages/message-dispatch.service.js";

describe("MessageDispatchService", () => {
  it("routes natural-language workflow creation requests to an independent visual workflow preview", async () => {
    const executeWorkflow = vi.fn();
    const launchedWorkflow = {
      conversationId: "conv_group",
      createdAt: new Date("2026-06-08T00:00:00.000Z"),
      definition: {
        edges: [
          { from: "input_movie", id: "edge_input_collect", label: "电影名", to: "collect_material" }
        ],
        inputSchema: [
          { key: "movieName", label: "电影名" }
        ],
        nodes: [
          {
            id: "input_movie",
            inputSummary: "用户输入电影名。",
            label: "输入节点：电影名",
            outputSummary: "标准化后的电影名。",
            role: "用户输入",
            type: "input"
          },
          {
            id: "collect_material",
            inputSummary: "接收电影名。",
            label: "资料收集节点",
            outputSummary: "影片资料。",
            role: "资料收集",
            type: "collection"
          }
        ],
        outputSchema: [
          { key: "htmlArtifact", label: "HTML artifact", mimeType: "text/html" }
        ]
      },
      description:
        "对话触发 Workflow 验收 2026-06-08：请通过对话帮我创建一个新的编码 workflow。目标：制作一个关于《银翼杀手》电影世界观的单页网页，包含首屏、作品时间线、角色卡片和可下载 HTML。请先由技术负责人拆解计划并等待我批准，不要直接开始实现。",
      id: "visual_workflow_created",
      latestRun: null,
      ownerUserId: "user_owner",
      sourceMessageId: "msg_user",
      status: "preview",
      title: "制作一个关于《银翼杀手》电影世界观的单页网页，包含首屏、作品时间线、角色卡片和可下载 HTML workflow",
      updatedAt: new Date("2026-06-08T00:00:00.000Z"),
      workspaceId: "workspace_1"
    };
    const messagesService = {
      create: vi.fn(async () => ({
        content:
          "对话触发 Workflow 验收 2026-06-08：请通过对话帮我创建一个新的编码 workflow。目标：制作一个关于《银翼杀手》电影世界观的单页网页，包含首屏、作品时间线、角色卡片和可下载 HTML。请先由技术负责人拆解计划并等待我批准，不要直接开始实现。",
        conversationId: "conv_group",
        id: "msg_user",
        mentionedAgentIds: [],
        mentionedUserIds: [],
        role: "user"
      })),
      createAssistantMessage: vi.fn(async (input: unknown) => input),
      resolveSendAccess: vi.fn(async () => ({
        ownerUserId: "user_owner",
        permission: "comment"
      }))
    };
    const recordAgentRunsStarted = vi.fn(async () => undefined);
    const codingWorkflowsService = {
      create: vi.fn()
    };
    const permissionGuard = {
      assert: vi.fn(async () => undefined)
    };
    const visualWorkflowsService = {
      createFromMessage: vi.fn(async () => launchedWorkflow)
    };
    const service = new MessageDispatchService(
      {
        listConversationAgentsWithProviders: vi.fn(async () => [
          {
            agent_id: "agent_tech_lead",
            agent_name: "技术负责人",
            capability_tags: ["builtin-coding-team", "role:tech_lead"],
            mode: "group",
            output_style: null,
            provider: "mock",
            scope_description: null,
            system_prompt: null
          },
          {
            agent_id: "agent_engineer",
            agent_name: "软件工程师",
            capability_tags: ["builtin-coding-team", "role:software_engineer"],
            mode: "group",
            output_style: null,
            provider: "mock",
            scope_description: null,
            system_prompt: null
          }
        ])
      } as never,
      messagesService as never,
      { incrementCounter: vi.fn() } as never,
      {
        recordAgentRunsStarted,
        recordGroupExecution: vi.fn(async () => undefined)
      } as never,
      { loadConversationContext: vi.fn(async () => undefined) } as never,
      { consume: vi.fn(async () => ({ allowed: true })) } as never,
      { publish: vi.fn() } as never,
      { error: vi.fn(), warn: vi.fn() } as never,
      {
        startSpan: vi.fn(() => ({
          end: vi.fn(),
          fail: vi.fn()
        }))
      } as never,
      undefined,
      codingWorkflowsService as never,
      permissionGuard as never,
      visualWorkflowsService as never
    );

    Object.assign(
      service as unknown as {
        getTemporalClient: () => Promise<{
          workflow: {
            execute: typeof executeWorkflow;
          };
        }>;
      },
      {
        getTemporalClient: async () => ({
          workflow: {
            execute: executeWorkflow
          }
        })
      }
    );

    const response = await service.send(
      {
        content:
          "对话触发 Workflow 验收 2026-06-08：请通过对话帮我创建一个新的编码 workflow。目标：制作一个关于《银翼杀手》电影世界观的单页网页，包含首屏、作品时间线、角色卡片和可下载 HTML。请先由技术负责人拆解计划并等待我批准，不要直接开始实现。",
        conversationId: "conv_group",
        role: "user",
        workspaceId: "workspace_1"
      },
      "user_owner"
    );
    await new Promise((resolve) => setImmediate(resolve));

    expect(permissionGuard.assert).not.toHaveBeenCalled();
    expect(codingWorkflowsService.create).not.toHaveBeenCalled();
    expect(visualWorkflowsService.createFromMessage).toHaveBeenCalledWith(
      {
        content:
          "对话触发 Workflow 验收 2026-06-08：请通过对话帮我创建一个新的编码 workflow。目标：制作一个关于《银翼杀手》电影世界观的单页网页，包含首屏、作品时间线、角色卡片和可下载 HTML。请先由技术负责人拆解计划并等待我批准，不要直接开始实现。",
        conversationId: "conv_group",
        ownerUserId: "user_owner",
        sourceMessageId: "msg_user",
        workspaceId: "workspace_1"
      }
    );
    expect(response).toEqual(
      expect.objectContaining({
        id: "msg_user",
        launchedWorkflow
      })
    );
    expect(executeWorkflow).not.toHaveBeenCalled();
    expect(recordAgentRunsStarted).not.toHaveBeenCalled();
  });

  it("starts a no-mention group request with every channel AI teammate in stable order", async () => {
    const executeWorkflow = vi.fn(async () => ({
      finalContent: "Collaborative reply",
      state: {
        failures: [],
        results: [
          {
            agentId: "agent_planner",
            agentName: "Planner",
            finalContent: "Planner reply",
            provider: "mock"
          },
          {
            agentId: "agent_executor",
            agentName: "Executor",
            finalContent: "Executor reply",
            provider: "mock"
          },
          {
            agentId: "agent_reviewer",
            agentName: "Reviewer",
            finalContent: "Reviewer reply",
            provider: "mock"
          }
        ]
      },
      streamEvents: []
    }));
    const messagesService = {
      create: vi.fn(async () => ({
        content: "请协作推进这个目标",
        conversationId: "conv_group",
        id: "msg_user",
        mentionedAgentIds: [],
        mentionedUserIds: [],
        role: "user"
      })),
      createAssistantMessage: vi.fn(async (input: unknown) => input),
      resolveSendAccess: vi.fn(async () => ({
        ownerUserId: "user_owner",
        permission: "comment"
      }))
    };
    const recordAgentRunsStarted = vi.fn(async () => undefined);
    const service = new MessageDispatchService(
      {
        listConversationAgentsWithProviders: vi.fn(async () => [
          {
            agent_id: "agent_planner",
            agent_name: "Planner",
            capability_tags: ["channel:coordinator", "role:planning"],
            mode: "group",
            output_style: null,
            provider: "mock",
            scope_description: null,
            system_prompt: null
          },
          {
            agent_id: "agent_executor",
            agent_name: "Executor",
            capability_tags: ["role:software-engineer"],
            mode: "group",
            output_style: null,
            provider: "mock",
            scope_description: null,
            system_prompt: null
          },
          {
            agent_id: "agent_reviewer",
            agent_name: "Reviewer",
            capability_tags: ["role:reviewer"],
            mode: "group",
            output_style: null,
            provider: "mock",
            scope_description: null,
            system_prompt: null
          }
        ])
      } as never,
      messagesService as never,
      { incrementCounter: vi.fn() } as never,
      {
        recordAgentRunsStarted,
        recordGroupExecution: vi.fn(async () => undefined)
      } as never,
      { loadConversationContext: vi.fn(async () => undefined) } as never,
      { consume: vi.fn(async () => ({ allowed: true })) } as never,
      { publish: vi.fn() } as never,
      { error: vi.fn(), warn: vi.fn() } as never,
      {
        startSpan: vi.fn(() => ({
          end: vi.fn(),
          fail: vi.fn()
        }))
      } as never
    );

    Object.assign(
      service as unknown as {
        getTemporalClient: () => Promise<{
          workflow: {
            execute: typeof executeWorkflow;
          };
        }>;
      },
      {
        getTemporalClient: async () => ({
          workflow: {
            execute: executeWorkflow
          }
        })
      }
    );

    await service.send(
      {
        content: "请协作推进这个目标",
        conversationId: "conv_group",
        role: "user",
        workspaceId: "workspace_1"
      },
      "user_owner"
    );
    await new Promise((resolve) => setImmediate(resolve));

    expect(executeWorkflow).toHaveBeenCalledWith(
      "groupOrchestratorWorkflow",
      expect.objectContaining({
        args: [
          expect.objectContaining({
            initialTargetAgentIds: [
              "agent_planner",
              "agent_executor",
              "agent_reviewer"
            ],
            lockInitialTargets: false
          })
        ]
      })
    );
    expect(recordAgentRunsStarted).toHaveBeenCalledWith(
      expect.objectContaining({
        channelId: "conv_group",
        runs: [
          expect.objectContaining({
            agentId: "agent_planner",
            turnKey: "group:msg_user:turn:0:agent_planner"
          }),
          expect.objectContaining({
            agentId: "agent_executor",
            turnKey: "group:msg_user:turn:1:agent_executor"
          }),
          expect.objectContaining({
            agentId: "agent_reviewer",
            turnKey: "group:msg_user:turn:2:agent_reviewer"
          }),
          expect.objectContaining({
            agentId: "agent_planner",
            turnKey: "group:msg_user:turn:3:agent_planner"
          }),
          expect.objectContaining({
            agentId: "agent_executor",
            turnKey: "group:msg_user:turn:4:agent_executor"
          }),
          expect.objectContaining({
            agentId: "agent_reviewer",
            turnKey: "group:msg_user:turn:5:agent_reviewer"
          })
        ],
        userMessageId: "msg_user",
        workspaceId: "workspace_1"
      })
    );
  });

  it("locks group workflow targets when dispatching an explicit AI mention", async () => {
    const executeWorkflow = vi.fn(async () => ({
      finalContent: "Planner reply",
      state: {
        failures: [],
        results: [
          {
            agentId: "agent_planner",
            agentName: "Planner",
            finalContent: "Planner reply",
            provider: "mock"
          }
        ]
      },
      streamEvents: []
    }));
    const messagesService = {
      create: vi.fn(async () => ({
        content: "@Planner 回归测试",
        conversationId: "conv_group",
        id: "msg_user",
        mentionedAgentIds: ["agent_planner"],
        mentionedUserIds: [],
        role: "user"
      })),
      createAssistantMessage: vi.fn(async (input: unknown) => input),
      resolveSendAccess: vi.fn(async () => ({
        ownerUserId: "user_owner",
        permission: "comment"
      }))
    };
    const service = new MessageDispatchService(
      {
        listConversationAgentsWithProviders: vi.fn(async () => [
          {
            agent_id: "agent_planner",
            agent_name: "Planner",
            capability_tags: ["role:planning"],
            mode: "group",
            output_style: null,
            provider: "mock",
            scope_description: null,
            system_prompt: null
          },
          {
            agent_id: "agent_executor",
            agent_name: "Executor",
            capability_tags: ["role:software-engineer"],
            mode: "group",
            output_style: null,
            provider: "mock",
            scope_description: null,
            system_prompt: null
          }
        ])
      } as never,
      messagesService as never,
      { incrementCounter: vi.fn() } as never,
      { recordGroupExecution: vi.fn(async () => undefined) } as never,
      { loadConversationContext: vi.fn(async () => undefined) } as never,
      { consume: vi.fn(async () => ({ allowed: true })) } as never,
      { publish: vi.fn() } as never,
      { error: vi.fn(), warn: vi.fn() } as never,
      {
        startSpan: vi.fn(() => ({
          end: vi.fn(),
          fail: vi.fn()
        }))
      } as never
    );

    Object.assign(
      service as unknown as {
        getTemporalClient: () => Promise<{
          workflow: {
            execute: typeof executeWorkflow;
          };
        }>;
      },
      {
        getTemporalClient: async () => ({
          workflow: {
            execute: executeWorkflow
          }
        })
      }
    );

    await service.send(
      {
        content: "@Planner 回归测试",
        conversationId: "conv_group",
        mentionedAgentIds: ["agent_planner"],
        role: "user",
        workspaceId: "workspace_1"
      },
      "user_owner"
    );
    await new Promise((resolve) => setImmediate(resolve));

    expect(executeWorkflow).toHaveBeenCalledWith(
      "groupOrchestratorWorkflow",
      expect.objectContaining({
        args: [
          expect.objectContaining({
            initialTargetAgentIds: ["agent_planner"],
            lockInitialTargets: true
          })
        ]
      })
    );
  });

  it("cleans internal collaboration control JSON before creating group assistant messages", async () => {
    const visibleMarkdown = [
      "## 技术方案",
      "",
      "| 模块 | 处理 |",
      "| --- | --- |",
      "| 交互层 | 保留用户可见说明 |",
      "",
      "下一步会继续拆分实现任务。"
    ].join("\n");
    const dirtyContent = `我将请另一位同事先梳理方案，稍后我会基于这些内容补充风险。 ORCHESTRATOR metadata handoff target

${visibleMarkdown}
[{"type":"handoff_request","targetRoleKey":"builder","targetAgentId":"agent_builder","goal":"安排实现同事继续","acceptanceCriteria":["完成测试"],"constraints":["保持用户可配置"]},{"type":"handoff_request","targetRoleKey":"reviewer","goal":"安排复核","acceptanceCriteria":["完成复核"],"constraints":["不要改变用户可见正文"]}]`;
    const executeWorkflow = vi.fn(async () => ({
      finalContent: dirtyContent,
      state: {
        failures: [],
        results: [
          {
            agentId: "agent_planner",
            agentName: "Planner",
            finalContent: dirtyContent,
            provider: "mock"
          }
        ]
      },
      streamEvents: []
    }));
    const recordGroupExecution = vi.fn(async () => undefined);
    const messagesService = {
      create: vi.fn(async () => ({
        content: "请协作推进这个目标",
        conversationId: "conv_group",
        id: "msg_user",
        mentionedAgentIds: [],
        mentionedUserIds: [],
        role: "user"
      })),
      createAssistantMessage: vi.fn(async (input: unknown) => input),
      resolveSendAccess: vi.fn(async () => ({
        ownerUserId: "user_owner",
        permission: "comment"
      }))
    };
    const service = new MessageDispatchService(
      {
        listConversationAgentsWithProviders: vi.fn(async () => [
          {
            agent_id: "agent_planner",
            agent_name: "Planner",
            capability_tags: ["role:planning"],
            mode: "group",
            output_style: null,
            provider: "mock",
            scope_description: null,
            system_prompt: null
          }
        ])
      } as never,
      messagesService as never,
      { incrementCounter: vi.fn() } as never,
      { recordGroupExecution } as never,
      { loadConversationContext: vi.fn(async () => undefined) } as never,
      { consume: vi.fn(async () => ({ allowed: true })) } as never,
      { publish: vi.fn() } as never,
      { error: vi.fn(), warn: vi.fn() } as never,
      {
        startSpan: vi.fn(() => ({
          end: vi.fn(),
          fail: vi.fn()
        }))
      } as never
    );

    Object.assign(
      service as unknown as {
        getTemporalClient: () => Promise<{
          workflow: {
            execute: typeof executeWorkflow;
          };
        }>;
      },
      {
        getTemporalClient: async () => ({
          workflow: {
            execute: executeWorkflow
          }
        })
      }
    );

    await service.send(
      {
        content: "请协作推进这个目标",
        conversationId: "conv_group",
        role: "user",
        workspaceId: "workspace_1"
      },
      "user_owner"
    );
    await new Promise((resolve) => setImmediate(resolve));

    expect(messagesService.createAssistantMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        content: visibleMarkdown
      })
    );
    expect(recordGroupExecution).toHaveBeenCalledWith(
      expect.objectContaining({
        assistantMessages: [
          expect.objectContaining({
            result: expect.objectContaining({
              finalContent: visibleMarkdown
            })
          })
        ]
      })
    );
    expect(JSON.stringify(messagesService.createAssistantMessage.mock.calls)).not.toContain(
      "handoff_request"
    );
    expect(JSON.stringify(messagesService.createAssistantMessage.mock.calls)).not.toContain(
      "我将请"
    );
    expect(JSON.stringify(messagesService.createAssistantMessage.mock.calls)).not.toContain(
      "ORCHESTRATOR"
    );
  });

  it("persists direct runtime Markdown artifacts after creating the assistant message", async () => {
    const operations: string[] = [];
    const publishedEvents: unknown[] = [];
    const executeWorkflow = vi.fn(async () => ({
      artifacts: [
        {
          fileName: "release-notes.md",
          markdown: "# Release notes",
          mimeType: "text/markdown",
          title: "Release notes",
          type: "markdown"
        },
        {
          fileName: "codex-runtime.diff",
          mimeType: "text/x-diff",
          patch: "diff --git a/app.ts b/app.ts\n--- a/app.ts\n+++ b/app.ts\n@@ -1 +1 @@\n-old\n+new\n",
          title: "Codex 代码 Diff",
          truncated: false,
          type: "diff"
        }
      ],
      finalContent: "已生成发布说明。",
      streamEvents: []
    }));
    const createdAssistantMessages: Array<{ id: string; workspaceId: string }> = [];
    const messagesService = {
      create: vi.fn(async () => ({
        content: "生成发布说明",
        conversationId: "conv_direct",
        id: "msg_user",
        mentionedAgentIds: [],
        mentionedUserIds: [],
        role: "user"
      })),
      createAssistantMessage: vi.fn(async (input: {
        content: string;
        conversationId: string;
        id: string;
        ownerUserId: string;
        sourceAgentId: string | null;
        workspaceId: string;
      }) => {
        operations.push(`create:${input.id}`);
        createdAssistantMessages.push({
          id: input.id,
          workspaceId: input.workspaceId
        });
        return {
          ...input,
          authorUserId: null,
          createdAt: new Date("2026-06-02T16:52:49.803Z"),
          isPinned: false,
          mentionedAgentIds: [],
          mentionedUserIds: [],
          role: "assistant" as const,
          threadParentMessageId: null
        };
      }),
      resolveSendAccess: vi.fn(async () => ({
        ownerUserId: "user_owner",
        permission: "comment"
      }))
    };
    const artifactsService = {
      createRuntimeMarkdownArtifact: vi.fn(async (input: {
        draft: { title: string };
        messageId: string;
        workspaceId: string;
      }) => {
        operations.push(`markdown:${input.messageId}`);
        return {
          id: "artifact_release_notes",
          messageId: input.messageId,
          previewUrl: "http://storage.local/release-notes.md",
          title: input.draft.title
        };
      }),
      createRuntimeDiffArtifact: vi.fn(async (input: {
        draft: { title: string };
        messageId: string;
        workspaceId: string;
      }) => {
        operations.push(`diff:${input.messageId}`);
        return {
          id: "artifact_codex_diff",
          messageId: input.messageId,
          previewUrl: "http://storage.local/codex-runtime.diff",
          title: input.draft.title
        };
      })
    };
    const streamBroker = {
      publish: vi.fn((input: { event: unknown }) => {
        publishedEvents.push(input.event);
      })
    };
    const service = new MessageDispatchService(
      {
        listConversationAgentsWithProviders: vi.fn(async () => [
          {
            agent_id: "agent_writer",
            agent_name: "Writer",
            capability_tags: [],
            mode: "direct",
            output_style: null,
            provider: "mock",
            scope_description: null,
            system_prompt: null
          }
        ])
      } as never,
      messagesService as never,
      { incrementCounter: vi.fn() } as never,
      { recordDirectExecution: vi.fn(async () => undefined) } as never,
      { loadConversationContext: vi.fn(async () => undefined) } as never,
      { consume: vi.fn(async () => ({ allowed: true })) } as never,
      streamBroker as never,
      { error: vi.fn(), warn: vi.fn() } as never,
      {
        startSpan: vi.fn(() => ({
          end: vi.fn(),
          fail: vi.fn()
        }))
      } as never,
      artifactsService as never
    );

    Object.assign(
      service as unknown as {
        getTemporalClient: () => Promise<{
          workflow: {
            execute: typeof executeWorkflow;
          };
        }>;
      },
      {
        getTemporalClient: async () => ({
          workflow: {
            execute: executeWorkflow
          }
        })
      }
    );

    await service.send(
      {
        content: "生成发布说明",
        conversationId: "conv_direct",
        role: "user",
        workspaceId: "workspace_1"
      },
      "user_owner"
    );
    await new Promise((resolve) => setImmediate(resolve));

    const assistantMessage = createdAssistantMessages[0];
    expect(assistantMessage).toBeDefined();
    expect(artifactsService.createRuntimeMarkdownArtifact).toHaveBeenCalledWith(
      {
        draft: {
          fileName: "release-notes.md",
          markdown: "# Release notes",
          mimeType: "text/markdown",
          title: "Release notes",
          type: "markdown"
        },
        messageId: assistantMessage?.id,
        workspaceId: "workspace_1"
      },
      "user_owner"
    );
    expect(artifactsService.createRuntimeDiffArtifact).toHaveBeenCalledWith(
      {
        draft: {
          fileName: "codex-runtime.diff",
          mimeType: "text/x-diff",
          patch: "diff --git a/app.ts b/app.ts\n--- a/app.ts\n+++ b/app.ts\n@@ -1 +1 @@\n-old\n+new\n",
          title: "Codex 代码 Diff",
          truncated: false,
          type: "diff"
        },
        messageId: assistantMessage?.id,
        workspaceId: "workspace_1"
      },
      "user_owner"
    );
    const artifactStatusEvents = publishedEvents.filter(
      (event): event is {
        kind: "conversation.status";
        payload: {
          artifactStatus: {
            artifactId?: string;
            messageId: string;
            previewUrl?: string;
            status: string;
            title: string;
            type: string;
          };
          label: string;
          state: string;
        };
      } =>
        Boolean(event) &&
        typeof event === "object" &&
        "kind" in event &&
        event.kind === "conversation.status" &&
        "payload" in event &&
        Boolean(event.payload) &&
        typeof event.payload === "object" &&
        "artifactStatus" in event.payload
    );

    expect(artifactStatusEvents).toEqual([
      {
        kind: "conversation.status",
        payload: expect.objectContaining({
          artifactStatus: expect.objectContaining({
            messageId: assistantMessage?.id,
            status: "creating",
            title: "Release notes",
            type: "markdown"
          }),
          label: "orchestrator.running",
          state: "running"
        })
      },
      {
        kind: "conversation.status",
        payload: expect.objectContaining({
          artifactStatus: expect.objectContaining({
            artifactId: "artifact_release_notes",
            messageId: assistantMessage?.id,
            previewUrl: "http://storage.local/release-notes.md",
            status: "created",
            title: "Release notes",
            type: "markdown"
          }),
          label: "orchestrator.aggregated",
          state: "succeeded"
        })
      },
      {
        kind: "conversation.status",
        payload: expect.objectContaining({
          artifactStatus: expect.objectContaining({
            messageId: assistantMessage?.id,
            status: "creating",
            title: "Codex 代码 Diff",
            type: "diff"
          }),
          label: "orchestrator.running",
          state: "running"
        })
      },
      {
        kind: "conversation.status",
        payload: expect.objectContaining({
          artifactStatus: expect.objectContaining({
            artifactId: "artifact_codex_diff",
            messageId: assistantMessage?.id,
            previewUrl: "http://storage.local/codex-runtime.diff",
            status: "created",
            title: "Codex 代码 Diff",
            type: "diff"
          }),
          label: "orchestrator.aggregated",
          state: "succeeded"
        })
      }
    ]);
    expect(operations).toEqual([
      `create:${assistantMessage?.id}`,
      `markdown:${assistantMessage?.id}`,
      `diff:${assistantMessage?.id}`
    ]);
  });

  it("persists group runtime Markdown artifacts on the producing assistant message", async () => {
    const operations: string[] = [];
    const executeWorkflow = vi.fn(async () => ({
      finalContent: "Collaborative reply",
      state: {
        failures: [],
        results: [
          {
            agentId: "agent_planner",
            agentName: "Planner",
            artifacts: [
              {
                fileName: "implementation-plan.md",
                markdown: "# Plan",
                mimeType: "text/markdown",
                title: "Implementation plan",
                type: "markdown"
              }
            ],
            finalContent: "计划已整理。",
            provider: "mock"
          }
        ]
      },
      streamEvents: []
    }));
    const createdAssistantMessages: Array<{ id: string; workspaceId: string }> = [];
    const messagesService = {
      create: vi.fn(async () => ({
        content: "请协作推进计划",
        conversationId: "conv_group",
        id: "msg_user",
        mentionedAgentIds: [],
        mentionedUserIds: [],
        role: "user"
      })),
      createAssistantMessage: vi.fn(async (input: {
        content: string;
        conversationId: string;
        id: string;
        ownerUserId: string;
        sourceAgentId: string | null;
        workspaceId: string;
      }) => {
        operations.push(`create:${input.id}`);
        createdAssistantMessages.push({
          id: input.id,
          workspaceId: input.workspaceId
        });
        return {
          ...input,
          authorUserId: null,
          createdAt: new Date("2026-06-02T16:52:49.803Z"),
          isPinned: false,
          mentionedAgentIds: [],
          mentionedUserIds: [],
          role: "assistant" as const,
          threadParentMessageId: null
        };
      }),
      resolveSendAccess: vi.fn(async () => ({
        ownerUserId: "user_owner",
        permission: "comment"
      }))
    };
    const artifactsService = {
      createRuntimeMarkdownArtifact: vi.fn(async (input: {
        draft: { title: string };
        messageId: string;
        workspaceId: string;
      }) => {
        operations.push(`artifact:${input.messageId}`);
        return {
          id: "artifact_implementation_plan",
          messageId: input.messageId,
          title: input.draft.title
        };
      })
    };
    const service = new MessageDispatchService(
      {
        listConversationAgentsWithProviders: vi.fn(async () => [
          {
            agent_id: "agent_planner",
            agent_name: "Planner",
            capability_tags: ["role:planning"],
            mode: "group",
            output_style: null,
            provider: "mock",
            scope_description: null,
            system_prompt: null
          }
        ])
      } as never,
      messagesService as never,
      { incrementCounter: vi.fn() } as never,
      { recordGroupExecution: vi.fn(async () => undefined) } as never,
      { loadConversationContext: vi.fn(async () => undefined) } as never,
      { consume: vi.fn(async () => ({ allowed: true })) } as never,
      { publish: vi.fn() } as never,
      { error: vi.fn(), warn: vi.fn() } as never,
      {
        startSpan: vi.fn(() => ({
          end: vi.fn(),
          fail: vi.fn()
        }))
      } as never,
      artifactsService as never
    );

    Object.assign(
      service as unknown as {
        getTemporalClient: () => Promise<{
          workflow: {
            execute: typeof executeWorkflow;
          };
        }>;
      },
      {
        getTemporalClient: async () => ({
          workflow: {
            execute: executeWorkflow
          }
        })
      }
    );

    await service.send(
      {
        content: "请协作推进计划",
        conversationId: "conv_group",
        role: "user",
        workspaceId: "workspace_1"
      },
      "user_owner"
    );
    await new Promise((resolve) => setImmediate(resolve));

    const assistantMessage = createdAssistantMessages[0];
    expect(assistantMessage).toBeDefined();
    expect(artifactsService.createRuntimeMarkdownArtifact).toHaveBeenCalledWith(
      {
        draft: {
          fileName: "implementation-plan.md",
          markdown: "# Plan",
          mimeType: "text/markdown",
          title: "Implementation plan",
          type: "markdown"
        },
        messageId: assistantMessage?.id,
        workspaceId: "workspace_1"
      },
      "user_owner"
    );
    expect(operations).toEqual([
      `create:${assistantMessage?.id}`,
      `artifact:${assistantMessage?.id}`
    ]);
  });

  it("creates a fallback Markdown artifact when a group request asks for a downloadable deliverable", async () => {
    const operations: string[] = [];
    const executeWorkflow = vi.fn(async () => ({
      finalContent: "# 汇总方案\n\n这是最终 Markdown 交付物。",
      state: {
        failures: [],
        results: [
          {
            agentId: "agent_planner",
            agentName: "Planner",
            finalContent: "规划结果已完成。",
            provider: "mock"
          },
          {
            agentId: "agent_builder",
            agentName: "Builder",
            finalContent: "实现路线已补充。",
            provider: "mock"
          }
        ]
      },
      streamEvents: []
    }));
    const createdAssistantMessages: Array<{ id: string; sourceAgentId: string | null }> = [];
    const messagesService = {
      create: vi.fn(async () => ({
        content: "请两位同事协作，并产出一份可下载的 Markdown 交付物。",
        conversationId: "conv_group",
        id: "msg_user",
        mentionedAgentIds: [],
        mentionedUserIds: [],
        role: "user"
      })),
      createAssistantMessage: vi.fn(async (input: {
        content: string;
        conversationId: string;
        id: string;
        ownerUserId: string;
        sourceAgentId: string | null;
        workspaceId: string;
      }) => {
        operations.push(`create:${input.id}`);
        createdAssistantMessages.push({
          id: input.id,
          sourceAgentId: input.sourceAgentId
        });
        return {
          ...input,
          authorUserId: null,
          createdAt: new Date("2026-06-02T16:52:49.803Z"),
          isPinned: false,
          mentionedAgentIds: [],
          mentionedUserIds: [],
          role: "assistant" as const,
          threadParentMessageId: null
        };
      }),
      resolveSendAccess: vi.fn(async () => ({
        ownerUserId: "user_owner",
        permission: "comment"
      }))
    };
    const artifactsService = {
      createRuntimeMarkdownArtifact: vi.fn(async (input: {
        draft: { markdown: string; title: string };
        messageId: string;
        workspaceId: string;
      }) => {
        operations.push(`artifact:${input.messageId}`);
        return {
          id: "artifact_group_markdown_fallback",
          messageId: input.messageId,
          title: input.draft.title
        };
      })
    };
    const service = new MessageDispatchService(
      {
        listConversationAgentsWithProviders: vi.fn(async () => [
          {
            agent_id: "agent_planner",
            agent_name: "Planner",
            capability_tags: ["role:planning"],
            mode: "group",
            output_style: null,
            provider: "mock",
            scope_description: null,
            system_prompt: null
          },
          {
            agent_id: "agent_builder",
            agent_name: "Builder",
            capability_tags: ["role:software-engineer"],
            mode: "group",
            output_style: null,
            provider: "mock",
            scope_description: null,
            system_prompt: null
          }
        ])
      } as never,
      messagesService as never,
      { incrementCounter: vi.fn() } as never,
      { recordGroupExecution: vi.fn(async () => undefined) } as never,
      { loadConversationContext: vi.fn(async () => undefined) } as never,
      { consume: vi.fn(async () => ({ allowed: true })) } as never,
      { publish: vi.fn() } as never,
      { error: vi.fn(), warn: vi.fn() } as never,
      {
        startSpan: vi.fn(() => ({
          end: vi.fn(),
          fail: vi.fn()
        }))
      } as never,
      artifactsService as never
    );

    Object.assign(
      service as unknown as {
        getTemporalClient: () => Promise<{
          workflow: {
            execute: typeof executeWorkflow;
          };
        }>;
      },
      {
        getTemporalClient: async () => ({
          workflow: {
            execute: executeWorkflow
          }
        })
      }
    );

    await service.send(
      {
        content: "请两位同事协作，并产出一份可下载的 Markdown 交付物。",
        conversationId: "conv_group",
        role: "user",
        workspaceId: "workspace_1"
      },
      "user_owner"
    );
    await new Promise((resolve) => setImmediate(resolve));

    const finalAssistantMessage = createdAssistantMessages.at(-1);
    expect(finalAssistantMessage).toBeDefined();
    expect(artifactsService.createRuntimeMarkdownArtifact).toHaveBeenCalledWith(
      {
        draft: expect.objectContaining({
          fileName: "collaboration-deliverable.md",
          markdown: "# 汇总方案\n\n这是最终 Markdown 交付物。",
          mimeType: "text/markdown",
          title: "协作交付物",
          type: "markdown"
        }),
        messageId: finalAssistantMessage?.id,
        workspaceId: "workspace_1"
      },
      "user_owner"
    );
    expect(operations).toContain(`artifact:${finalAssistantMessage?.id}`);
  });

  it("creates a fallback Markdown artifact when the group result claims a downloadable Markdown file", async () => {
    const operations: string[] = [];
    const executeWorkflow = vi.fn(async () => ({
      finalContent: "已生成最终可下载 Markdown 文件。\n\n# 验收总结\n\n- 多同事协作已完成。",
      state: {
        failures: [],
        results: [
          {
            agentId: "agent_planner",
            agentName: "Planner",
            finalContent: "计划已拆分。",
            provider: "mock"
          },
          {
            agentId: "agent_builder",
            agentName: "Builder",
            finalContent: "已生成最终可下载 Markdown 文件。\n\n# 验收总结\n\n- 多同事协作已完成。",
            provider: "mock"
          }
        ]
      },
      streamEvents: []
    }));
    const createdAssistantMessages: Array<{ id: string; sourceAgentId: string | null }> = [];
    const messagesService = {
      create: vi.fn(async () => ({
        content: "请两位同事协作推进这个目标。",
        conversationId: "conv_group",
        id: "msg_user",
        mentionedAgentIds: [],
        mentionedUserIds: [],
        role: "user"
      })),
      createAssistantMessage: vi.fn(async (input: {
        content: string;
        conversationId: string;
        id: string;
        ownerUserId: string;
        sourceAgentId: string | null;
        workspaceId: string;
      }) => {
        operations.push(`create:${input.id}`);
        createdAssistantMessages.push({
          id: input.id,
          sourceAgentId: input.sourceAgentId
        });
        return {
          ...input,
          authorUserId: null,
          createdAt: new Date("2026-06-02T16:52:49.803Z"),
          isPinned: false,
          mentionedAgentIds: [],
          mentionedUserIds: [],
          role: "assistant" as const,
          threadParentMessageId: null
        };
      }),
      resolveSendAccess: vi.fn(async () => ({
        ownerUserId: "user_owner",
        permission: "comment"
      }))
    };
    const artifactsService = {
      createRuntimeMarkdownArtifact: vi.fn(async (input: {
        draft: { markdown: string; title: string };
        messageId: string;
        workspaceId: string;
      }) => {
        operations.push(`artifact:${input.messageId}`);
        return {
          id: "artifact_group_markdown_claim_fallback",
          messageId: input.messageId,
          title: input.draft.title
        };
      })
    };
    const service = new MessageDispatchService(
      {
        listConversationAgentsWithProviders: vi.fn(async () => [
          {
            agent_id: "agent_planner",
            agent_name: "Planner",
            capability_tags: ["role:planning"],
            mode: "group",
            output_style: null,
            provider: "mock",
            scope_description: null,
            system_prompt: null
          },
          {
            agent_id: "agent_builder",
            agent_name: "Builder",
            capability_tags: ["role:software-engineer"],
            mode: "group",
            output_style: null,
            provider: "mock",
            scope_description: null,
            system_prompt: null
          }
        ])
      } as never,
      messagesService as never,
      { incrementCounter: vi.fn() } as never,
      { recordGroupExecution: vi.fn(async () => undefined) } as never,
      { loadConversationContext: vi.fn(async () => undefined) } as never,
      { consume: vi.fn(async () => ({ allowed: true })) } as never,
      { publish: vi.fn() } as never,
      { error: vi.fn(), warn: vi.fn() } as never,
      {
        startSpan: vi.fn(() => ({
          end: vi.fn(),
          fail: vi.fn()
        }))
      } as never,
      artifactsService as never
    );

    Object.assign(
      service as unknown as {
        getTemporalClient: () => Promise<{
          workflow: {
            execute: typeof executeWorkflow;
          };
        }>;
      },
      {
        getTemporalClient: async () => ({
          workflow: {
            execute: executeWorkflow
          }
        })
      }
    );

    await service.send(
      {
        content: "请两位同事协作推进这个目标。",
        conversationId: "conv_group",
        role: "user",
        workspaceId: "workspace_1"
      },
      "user_owner"
    );
    await new Promise((resolve) => setImmediate(resolve));

    const finalAssistantMessage = createdAssistantMessages.at(-1);
    expect(finalAssistantMessage).toBeDefined();
    expect(artifactsService.createRuntimeMarkdownArtifact).toHaveBeenCalledWith(
      {
        draft: expect.objectContaining({
          fileName: "collaboration-deliverable.md",
          markdown: "已生成最终可下载 Markdown 文件。\n\n# 验收总结\n\n- 多同事协作已完成。",
          mimeType: "text/markdown",
          title: "协作交付物",
          type: "markdown"
        }),
        messageId: finalAssistantMessage?.id,
        workspaceId: "workspace_1"
      },
      "user_owner"
    );
    expect(operations).toContain(`artifact:${finalAssistantMessage?.id}`);
  });

  it("publishes sanitized completed events for each persisted group assistant message", async () => {
    const visiblePlannerReply = "Planner reply ready.";
    const visibleBuilderReply = "Builder reply ready.";
    const dirtyPlannerReply = `${visiblePlannerReply}
[{"type":"handoff_request","targetRoleKey":"builder","goal":"继续实现","acceptanceCriteria":["完成实现"],"constraints":["不要暴露控制字段"]}]`;
    const operations: string[] = [];
    const publishedEvents: unknown[] = [];
    const executeWorkflow = vi.fn(async () => ({
      finalContent: "Collaborative reply",
      state: {
        failures: [],
        results: [
          {
            agentId: "agent_planner",
            agentName: "Planner",
            finalContent: dirtyPlannerReply,
            provider: "mock"
          },
          {
            agentId: "agent_builder",
            agentName: "Builder",
            finalContent: visibleBuilderReply,
            provider: "mock"
          }
        ]
      },
      streamEvents: []
    }));
    const messagesService = {
      create: vi.fn(async () => ({
        content: "请协作推进这个目标",
        conversationId: "conv_group",
        id: "msg_user",
        mentionedAgentIds: [],
        mentionedUserIds: [],
        role: "user"
      })),
      createAssistantMessage: vi.fn(async (input: {
        content: string;
        conversationId: string;
        id: string;
        ownerUserId: string;
        sourceAgentId: string | null;
        workspaceId: string;
      }) => {
        operations.push(`create:${input.id}`);
        return {
          ...input,
          authorUserId: null,
          createdAt: new Date("2026-06-02T16:52:49.803Z"),
          isPinned: false,
          mentionedAgentIds: [],
          mentionedUserIds: [],
          role: "assistant" as const,
          threadParentMessageId: null
        };
      }),
      resolveSendAccess: vi.fn(async () => ({
        ownerUserId: "user_owner",
        permission: "comment"
      }))
    };
    const streamBroker = {
      publish: vi.fn((input: { event: unknown }) => {
        publishedEvents.push(input.event);
        if (
          input.event &&
          typeof input.event === "object" &&
          "kind" in input.event &&
          input.event.kind === "conversation.message.completed" &&
          "payload" in input.event &&
          input.event.payload &&
          typeof input.event.payload === "object" &&
          "messageId" in input.event.payload
        ) {
          operations.push(`publish:${String(input.event.payload.messageId)}`);
        }
      })
    };
    const service = new MessageDispatchService(
      {
        listConversationAgentsWithProviders: vi.fn(async () => [
          {
            agent_id: "agent_planner",
            agent_name: "Planner",
            capability_tags: ["role:planning"],
            mode: "group",
            output_style: null,
            provider: "mock",
            scope_description: null,
            system_prompt: null
          },
          {
            agent_id: "agent_builder",
            agent_name: "Builder",
            capability_tags: ["role:software-engineer"],
            mode: "group",
            output_style: null,
            provider: "mock",
            scope_description: null,
            system_prompt: null
          }
        ])
      } as never,
      messagesService as never,
      { incrementCounter: vi.fn() } as never,
      { recordGroupExecution: vi.fn(async () => undefined) } as never,
      { loadConversationContext: vi.fn(async () => undefined) } as never,
      { consume: vi.fn(async () => ({ allowed: true })) } as never,
      streamBroker as never,
      { error: vi.fn(), warn: vi.fn() } as never,
      {
        startSpan: vi.fn(() => ({
          end: vi.fn(),
          fail: vi.fn()
        }))
      } as never
    );

    Object.assign(
      service as unknown as {
        getTemporalClient: () => Promise<{
          workflow: {
            execute: typeof executeWorkflow;
          };
        }>;
      },
      {
        getTemporalClient: async () => ({
          workflow: {
            execute: executeWorkflow
          }
        })
      }
    );

    await service.send(
      {
        content: "请协作推进这个目标",
        conversationId: "conv_group",
        role: "user",
        workspaceId: "workspace_1"
      },
      "user_owner"
    );
    await new Promise((resolve) => setImmediate(resolve));

    const createdMessages = messagesService.createAssistantMessage.mock.results;
    const createdMessageIds = await Promise.all(
      createdMessages.map(async (result) => (await result.value).id)
    );
    const completedEvents = publishedEvents.filter(
      (event): event is {
        kind: "conversation.message.completed";
        payload: { finalContent: string; messageId: string };
      } =>
        Boolean(event) &&
        typeof event === "object" &&
        "kind" in event &&
        event.kind === "conversation.message.completed" &&
        "payload" in event
    );

    expect(messagesService.createAssistantMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        content: visiblePlannerReply,
        sourceAgentId: "agent_planner"
      })
    );
    expect(completedEvents).toEqual([
      {
        kind: "conversation.message.completed",
        payload: {
          finalContent: visiblePlannerReply,
          messageId: createdMessageIds[0]
        }
      },
      {
        kind: "conversation.message.completed",
        payload: {
          finalContent: visibleBuilderReply,
          messageId: createdMessageIds[1]
        }
      }
    ]);
    expect(operations).toEqual([
      `create:${createdMessageIds[0]}`,
      `create:${createdMessageIds[1]}`,
      `publish:${createdMessageIds[0]}`,
      `publish:${createdMessageIds[1]}`
    ]);
    expect(JSON.stringify(publishedEvents)).not.toContain("handoff_request");
  });

  it("creates a visible group failure message when detached workflow dispatch fails", async () => {
    const executeWorkflow = vi.fn(async () => {
      throw new Error("provider offline");
    });
    const publishedEvents: unknown[] = [];
    const recordAgentRunsStarted = vi.fn(async () => undefined);
    const recordAgentRunsFailed = vi.fn(async () => undefined);
    const messagesService = {
      create: vi.fn(async () => ({
        content: "请两位同事协作生成交付物",
        conversationId: "conv_group",
        id: "msg_user",
        mentionedAgentIds: [],
        mentionedUserIds: [],
        role: "user"
      })),
      createAssistantMessage: vi.fn(async (input: {
        content: string;
        conversationId: string;
        id: string;
        ownerUserId: string;
        sourceAgentId: string | null;
        workspaceId: string;
      }) => ({
        ...input,
        authorUserId: null,
        createdAt: new Date("2026-06-02T16:52:49.803Z"),
        isPinned: false,
        mentionedAgentIds: [],
        mentionedUserIds: [],
        role: "assistant" as const,
        threadParentMessageId: null
      })),
      resolveSendAccess: vi.fn(async () => ({
        ownerUserId: "user_owner",
        permission: "comment"
      }))
    };
    const service = new MessageDispatchService(
      {
        listConversationAgentsWithProviders: vi.fn(async () => [
          {
            agent_id: "agent_planner",
            agent_name: "Planner",
            capability_tags: ["role:planning"],
            mode: "group",
            output_style: null,
            provider: "mock",
            scope_description: null,
            system_prompt: null
          },
          {
            agent_id: "agent_builder",
            agent_name: "Builder",
            capability_tags: ["role:software-engineer"],
            mode: "group",
            output_style: null,
            provider: "mock",
            scope_description: null,
            system_prompt: null
          }
        ])
      } as never,
      messagesService as never,
      { incrementCounter: vi.fn() } as never,
      {
        recordAgentRunsFailed,
        recordAgentRunsStarted,
        recordGroupExecution: vi.fn(async () => undefined)
      } as never,
      { loadConversationContext: vi.fn(async () => undefined) } as never,
      { consume: vi.fn(async () => ({ allowed: true })) } as never,
      {
        publish: vi.fn((input: { event: unknown }) => {
          publishedEvents.push(input.event);
        })
      } as never,
      { error: vi.fn(), warn: vi.fn() } as never,
      {
        startSpan: vi.fn(() => ({
          end: vi.fn(),
          fail: vi.fn()
        }))
      } as never
    );

    Object.assign(
      service as unknown as {
        getTemporalClient: () => Promise<{
          workflow: {
            execute: typeof executeWorkflow;
          };
        }>;
      },
      {
        getTemporalClient: async () => ({
          workflow: {
            execute: executeWorkflow
          }
        })
      }
    );

    await service.send(
      {
        content: "请两位同事协作生成交付物",
        conversationId: "conv_group",
        role: "user",
        workspaceId: "workspace_1"
      },
      "user_owner"
    );
    await new Promise((resolve) => setImmediate(resolve));

    expect(recordAgentRunsStarted).toHaveBeenCalled();
    expect(publishedEvents).toContainEqual(
      expect.objectContaining({
        kind: "conversation.status",
        payload: expect.objectContaining({
          activeAgentName: "Planner",
          label: "orchestrator.dispatched",
          state: "running",
          summary: expect.stringContaining("已安排")
        })
      })
    );
    expect(recordAgentRunsFailed).toHaveBeenCalledWith(
      expect.objectContaining({
        channelId: "conv_group",
        errorCode: "provider_dispatch_failed",
        errorMessage: "provider offline",
        userMessageId: "msg_user",
        workspaceId: "workspace_1"
      })
    );
    expect(messagesService.createAssistantMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining("这次多同事协作没有完成"),
        sourceAgentId: null
      })
    );
    expect(publishedEvents).toContainEqual(
      expect.objectContaining({
        kind: "conversation.message.completed",
        payload: expect.objectContaining({
          finalContent: expect.stringContaining("这次多同事协作没有完成")
        })
      })
    );
  });

  it("records direct agent run checkpoints when provider dispatch fails", async () => {
    const executeWorkflow = vi.fn(async () => {
      throw new Error("provider offline");
    });
    const recordAgentRunsStarted = vi.fn(async () => undefined);
    const recordAgentRunsFailed = vi.fn(async () => undefined);
    const recordDirectExecution = vi.fn(async () => undefined);
    const messagesService = {
      create: vi.fn(async () => ({
        content: "生成发布说明",
        conversationId: "conv_direct",
        id: "msg_user",
        mentionedAgentIds: [],
        mentionedUserIds: [],
        role: "user"
      })),
      createAssistantMessage: vi.fn(async (input: {
        content: string;
        conversationId: string;
        id: string;
        ownerUserId: string;
        sourceAgentId: string | null;
        workspaceId: string;
      }) => ({
        ...input,
        authorUserId: null,
        createdAt: new Date("2026-06-02T16:52:49.803Z"),
        isPinned: false,
        mentionedAgentIds: [],
        mentionedUserIds: [],
        role: "assistant" as const,
        threadParentMessageId: null
      })),
      resolveSendAccess: vi.fn(async () => ({
        ownerUserId: "user_owner",
        permission: "comment"
      }))
    };
    const service = new MessageDispatchService(
      {
        listConversationAgentsWithProviders: vi.fn(async () => [
          {
            agent_id: "agent_writer",
            agent_name: "Writer",
            capability_tags: [],
            mode: "direct",
            output_style: null,
            provider: "mock",
            scope_description: null,
            system_prompt: null
          }
        ])
      } as never,
      messagesService as never,
      { incrementCounter: vi.fn() } as never,
      {
        recordAgentRunsFailed,
        recordAgentRunsStarted,
        recordDirectExecution
      } as never,
      { loadConversationContext: vi.fn(async () => undefined) } as never,
      { consume: vi.fn(async () => ({ allowed: true })) } as never,
      { publish: vi.fn() } as never,
      { error: vi.fn(), warn: vi.fn() } as never,
      {
        startSpan: vi.fn(() => ({
          end: vi.fn(),
          fail: vi.fn()
        }))
      } as never
    );

    Object.assign(
      service as unknown as {
        getTemporalClient: () => Promise<{
          workflow: {
            execute: typeof executeWorkflow;
          };
        }>;
      },
      {
        getTemporalClient: async () => ({
          workflow: {
            execute: executeWorkflow
          }
        })
      }
    );

    await service.send(
      {
        content: "生成发布说明",
        conversationId: "conv_direct",
        role: "user",
        workspaceId: "workspace_1"
      },
      "user_owner"
    );
    await new Promise((resolve) => setImmediate(resolve));

    expect(recordAgentRunsStarted).toHaveBeenCalledWith(
      expect.objectContaining({
        channelId: "conv_direct",
        runs: [
          expect.objectContaining({
            agentId: "agent_writer",
            provider: "mock",
            reason: "scheduled_followup"
          })
        ],
        userMessageId: "msg_user",
        workspaceId: "workspace_1"
      })
    );
    expect(recordAgentRunsFailed).toHaveBeenCalledWith(
      expect.objectContaining({
        channelId: "conv_direct",
        errorCode: "provider_dispatch_failed",
        errorMessage: "provider offline",
        runs: [
          expect.objectContaining({
            agentId: "agent_writer",
            provider: "mock",
            reason: "scheduled_followup"
          })
        ],
        userMessageId: "msg_user",
        workspaceId: "workspace_1"
      })
    );
    expect(recordDirectExecution).not.toHaveBeenCalled();
    expect(messagesService.createAssistantMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining("这次 AI 同事执行没有完成"),
        sourceAgentId: "agent_writer"
      })
    );
  });

});
