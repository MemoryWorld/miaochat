import { describe, expect, it, vi } from "vitest";

import { MessageDispatchService } from "../src/modules/messages/message-dispatch.service.js";

describe("MessageDispatchService", () => {
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
});
