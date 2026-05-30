// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
  waitFor
} from "@testing-library/react";
import type * as NextNavigationModule from "next/navigation";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ChannelShell } from "./channel-shell";

const fetchMock = vi.fn<typeof fetch>();
const apiBaseUrl = "/api";

class MockEventSource {
  static instances: MockEventSource[] = [];

  readonly close = vi.fn();
  readonly init: EventSourceInit | undefined;
  readonly url: string;
  onerror: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent<string>) => void) | null = null;
  onopen: ((event: Event) => void) | null = null;

  constructor(url: string, init?: EventSourceInit) {
    this.init = init;
    this.url = url;
    MockEventSource.instances.push(this);
  }

  emitMessage(data: unknown) {
    this.onmessage?.(
      new MessageEvent("message", {
        data: JSON.stringify(data)
      })
    );
  }

  emitOpen() {
    this.onopen?.(new Event("open"));
  }
}

vi.mock("next/navigation", async () => {
  const actual = await vi.importActual<NextNavigationModule>("next/navigation");
  return {
    ...actual,
    usePathname: () => "/channels/conv_phase_d"
  };
});

describe("ChannelShell", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("EventSource", MockEventSource);
    MockEventSource.instances = [];
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it("loads channel-scoped chat, workflow, approvals, activity, and file surfaces", async () => {
    mockFetchByUrl({
      [`${apiBaseUrl}/workspaces`]: [
        jsonResponse(200, [
          {
            createdAt: "2026-05-29T00:00:00.000Z",
            id: "default-workspace",
            name: "默认工作区",
            ownerUserId: "user_demo",
            updatedAt: "2026-05-29T00:00:00.000Z"
          }
        ])
      ],
      [`${apiBaseUrl}/channels?workspaceId=default-workspace`]: [
        jsonResponse(200, [
          {
            conversationId: "conv_phase_d",
            id: "conv_phase_d",
            memberTeammateIds: ["tech_lead", "software_engineer", "code_reviewer", "qa_tester"],
            sourceType: "conversation",
            summary: "4 位协作成员共享这个频道。",
            title: "Phase D 编码频道",
            unreadCount: 0,
            updatedAt: "2026-05-29T00:00:00.000Z",
            visibility: "workspace",
            workspaceId: "default-workspace"
          }
        ])
      ],
      [`${apiBaseUrl}/conversations?workspaceId=default-workspace`]: [
        jsonResponse(200, [
          {
            archivedAt: null,
            id: "conv_phase_d",
            isPinned: false,
            mode: "group",
            ownerUserId: "user_demo",
            participants: [
              { agentId: "agent_tech_lead", agentName: "技术负责人" }
            ],
            pinnedMessageIds: [],
            title: "Phase D 编码频道",
            updatedAt: "2026-05-29T00:00:00.000Z",
            workspaceId: "default-workspace"
          }
        ])
      ],
      [`${apiBaseUrl}/channels/conv_phase_d/members?workspaceId=default-workspace`]: [
        jsonResponse(200, {
          aiCount: 1,
          channelId: "conv_phase_d",
          humanCount: 1,
          members: [
            {
              displayName: "你",
              kind: "human",
              memberId: "human:user_demo",
              permission: "manage",
              role: "owner",
              status: "active",
              userId: "user_demo"
            },
            {
              displayName: "技术负责人",
              kind: "ai",
              memberId: "ai:agent_tech_lead",
              permission: "comment",
              role: "ai_teammate",
              status: "available",
              teammateId: "agent_tech_lead"
            }
          ],
          totalCount: 2,
          workspaceId: "default-workspace"
        })
      ],
      [`${apiBaseUrl}/workspace-member-directory?workspaceId=default-workspace`]: [
        jsonResponse(200, [
          {
            actorType: "human",
            displayName: "你",
            id: "human:user_demo",
            joinedAt: "2026-05-29T00:00:00.000Z",
            lastActiveAt: "2026-05-29T00:00:00.000Z",
            principalKind: "human",
            role: "owner",
            roleLabel: "工作区成员",
            status: "active",
            summary: null,
            teammateId: null,
            userId: "user_demo",
            workspaceId: "default-workspace"
          }
        ])
      ],
      [`${apiBaseUrl}/messages?conversationId=conv_phase_d&workspaceId=default-workspace`]: [
        jsonResponse(200, [
          {
            content: "技术负责人已经提交首版计划，请先审批。",
            conversationId: "conv_phase_d",
            createdAt: "2026-05-29T00:00:00.000Z",
            id: "msg_plan",
            isPinned: false,
            mentionedAgentIds: [],
            ownerUserId: "user_demo",
            role: "assistant",
            sourceAgentId: "agent_tech_lead",
            workspaceId: "default-workspace"
          }
        ])
      ],
      [`${apiBaseUrl}/channel-files?channelId=conv_phase_d&workspaceId=default-workspace`]: [
        jsonResponse(200, [
          {
            channelId: "conv_phase_d",
            conversationId: "conv_phase_d",
            createdAt: "2026-05-29T00:00:00.000Z",
            id: "file_phase_d",
            kind: "attachment",
            messageId: "msg_plan",
            mimeType: "text/markdown",
            previewUrl: null,
            title: "计划附件",
            workspaceId: "default-workspace"
          }
        ])
      ],
      [`${apiBaseUrl}/activity?channelId=conv_phase_d&workspaceId=default-workspace`]: [
        jsonResponse(200, [
          {
            actingTeammateId: "tech_lead",
            actingTeammateName: "技术负责人",
            approvalRequestId: "approval_phase_d",
            channelId: "conv_phase_d",
            conversationId: "conv_phase_d",
            createdAt: "2026-05-29T00:00:00.000Z",
            endedAt: null,
            id: "round_plan",
            metadata: {},
            outputPreview: null,
            phase: "planning",
            startedAt: "2026-05-29T00:00:00.000Z",
            status: "waiting_for_approval",
            steps: [],
            summary: "技术负责人已提交首版计划。",
            toolActivityPreview: "计划整理与风险拆解",
            updatedAt: "2026-05-29T00:00:00.000Z",
            workflowId: "workflow_phase_d",
            workspaceId: "default-workspace"
          }
        ])
      ],
      [`${apiBaseUrl}/approvals?channelId=conv_phase_d&workspaceId=default-workspace`]: [
        jsonResponse(200, [
          {
            conversationId: "conv_phase_d",
            createdAt: "2026-05-29T00:00:00.000Z",
            id: "approval_phase_d",
            kind: "coding_plan",
            note: null,
            planVersion: 1,
            requesterTeammateId: "tech_lead",
            requesterTeammateName: "技术负责人",
            respondedAt: null,
            responseNote: null,
            status: "pending",
            summary: "技术负责人已提交第 1 版计划，等待用户确认。",
            targetUserId: "user_demo",
            title: "等待确认编码计划",
            updatedAt: "2026-05-29T00:00:00.000Z",
            workflowId: "workflow_phase_d",
            workspaceId: "default-workspace"
          }
        ])
      ],
      [`${apiBaseUrl}/coding-workflows?conversationId=conv_phase_d&workspaceId=default-workspace`]: [
        jsonResponse(200, {
          activePlanVersion: 1,
          approvalHistory: [],
          approvalState: "pending",
          conversationId: "conv_phase_d",
          createdAt: "2026-05-29T00:00:00.000Z",
          deadline: null,
          engineerAgentId: "agent_engineer",
          extraAgentIds: [],
          goal: "把 Phase D 壳层数据完整投影到频道页。",
          id: "workflow_phase_d",
          kickoffMessageId: "msg_kickoff",
          ownerUserId: "user_demo",
          planMessageId: "msg_plan",
          priority: "high",
          qaAgentId: "agent_qa",
          repoContext: null,
          reviewerAgentId: "agent_reviewer",
          runtimeBackend: "enhanced-hermes",
          state: "plan_pending_approval",
          taskSnapshot: [
            {
              id: "plan",
              ownerRole: "tech_lead",
              state: "in_review",
              title: "技术负责人提交计划"
            }
          ],
          teammates: [
            {
              agentId: "agent_tech_lead",
              isBuiltIn: true,
              name: "技术负责人",
              role: "tech_lead",
              runtimeBackend: "enhanced-hermes"
            }
          ],
          techLeadAgentId: "agent_tech_lead",
          updatedAt: "2026-05-29T00:00:00.000Z",
          workspaceId: "default-workspace"
        })
      ]
    });

    render(<ChannelShell channelId="conv_phase_d" />);

    expect(await screen.findByText("Phase D 编码频道")).toBeInTheDocument();
    expect(screen.getByText("成员与权限")).toBeInTheDocument();
    expect(screen.getByText("2 位成员 · 1 位同事 · 1 位 AI 同事")).toBeInTheDocument();
    expect(screen.getAllByText("你").length).toBeGreaterThan(0);
    const memberPanel = screen.getByRole("complementary", { name: "频道成员" });
    const createTeammateLink = within(memberPanel).getByRole("link", {
      name: "新建 AI 同事"
    });
    expect(createTeammateLink).toHaveAttribute(
      "href",
      "/teammates/new?channelId=conv_phase_d&returnTo=%2Fchannels%2Fconv_phase_d%3Ftab%3Dchat"
    );
    expect(screen.getByText("审批卡片")).toBeInTheDocument();
    expect(screen.getByText("等待确认编码计划")).toBeInTheDocument();
    expect(screen.getAllByText("技术负责人已经提交首版计划，请先审批。").length).toBeGreaterThan(0);

    await waitFor(() => {
      const requestedUrls = fetchMock.mock.calls.map(([url]) => url);
      expect(requestedUrls).toEqual(
        expect.arrayContaining([
          `${apiBaseUrl}/channels?workspaceId=default-workspace`,
          `${apiBaseUrl}/channels/conv_phase_d/members?workspaceId=default-workspace`,
          `${apiBaseUrl}/workspace-member-directory?workspaceId=default-workspace`,
          `${apiBaseUrl}/conversations?workspaceId=default-workspace`,
          `${apiBaseUrl}/messages?conversationId=conv_phase_d&workspaceId=default-workspace`,
          `${apiBaseUrl}/channel-files?channelId=conv_phase_d&workspaceId=default-workspace`,
          `${apiBaseUrl}/activity?channelId=conv_phase_d&workspaceId=default-workspace`,
          `${apiBaseUrl}/approvals?channelId=conv_phase_d&workspaceId=default-workspace`,
          `${apiBaseUrl}/coding-workflows?conversationId=conv_phase_d&workspaceId=default-workspace`
        ])
      );
    });
  });

  it("renders the file surface when the files tab is selected", async () => {
    mockFetchByUrl({
      [`${apiBaseUrl}/workspaces`]: [jsonResponse(200, [])],
      [`${apiBaseUrl}/channels?workspaceId=default-workspace`]: [
        jsonResponse(200, [
          {
            conversationId: "conv_phase_d",
            id: "conv_phase_d",
            memberTeammateIds: [],
            sourceType: "conversation",
            summary: "文件面测试",
            title: "文件频道",
            unreadCount: 0,
            updatedAt: "2026-05-29T00:00:00.000Z",
            visibility: "workspace",
            workspaceId: "default-workspace"
          }
        ])
      ],
      [`${apiBaseUrl}/conversations?workspaceId=default-workspace`]: [
        jsonResponse(200, [
          {
            archivedAt: null,
            id: "conv_phase_d",
            isPinned: false,
            mode: "group",
            ownerUserId: "user_demo",
            participants: [],
            pinnedMessageIds: [],
            title: "文件频道",
            updatedAt: "2026-05-29T00:00:00.000Z",
            workspaceId: "default-workspace"
          }
        ])
      ],
      [`${apiBaseUrl}/messages?conversationId=conv_phase_d&workspaceId=default-workspace`]: [
        jsonResponse(200, [])
      ],
      [`${apiBaseUrl}/channel-files?channelId=conv_phase_d&workspaceId=default-workspace`]: [
        jsonResponse(200, [
          {
            channelId: "conv_phase_d",
            conversationId: "conv_phase_d",
            createdAt: "2026-05-29T00:00:00.000Z",
            id: "file_phase_d",
            kind: "attachment",
            messageId: "msg_plan",
            mimeType: "text/markdown",
            previewUrl: null,
            title: "计划附件",
            workspaceId: "default-workspace"
          }
        ])
      ],
      [`${apiBaseUrl}/activity?channelId=conv_phase_d&workspaceId=default-workspace`]: [
        jsonResponse(200, [])
      ],
      [`${apiBaseUrl}/approvals?channelId=conv_phase_d&workspaceId=default-workspace`]: [
        jsonResponse(200, [])
      ],
      [`${apiBaseUrl}/coding-workflows?conversationId=conv_phase_d&workspaceId=default-workspace`]: [
        jsonResponse(200, null)
      ]
    });

    render(<ChannelShell channelId="conv_phase_d" initialTab="files" />);

    expect(await screen.findByText("计划附件")).toBeInTheDocument();
    expect(screen.getByText("MIME: text/markdown")).toBeInTheDocument();
    expect(screen.queryByText("频道成员")).not.toBeInTheDocument();
  });

  it("lets the user send a message directly inside the opened channel and refreshes after stream completion", async () => {
    mockFetchByUrl({
      [`${apiBaseUrl}/workspaces`]: [
        jsonResponse(200, [
          {
            createdAt: "2026-05-29T00:00:00.000Z",
            id: "default-workspace",
            name: "默认工作区",
            ownerUserId: "user_demo",
            updatedAt: "2026-05-29T00:00:00.000Z"
          }
        ])
      ],
      [`${apiBaseUrl}/channels?workspaceId=default-workspace`]: [
        jsonResponse(200, [
          {
            conversationId: "conv_phase_d",
            id: "conv_phase_d",
            memberTeammateIds: ["agent_tech_lead", "agent_engineer"],
            sourceType: "conversation",
            summary: "2 位协作成员共享这个频道。",
            title: "实时频道",
            unreadCount: 0,
            updatedAt: "2026-05-29T00:00:00.000Z",
            visibility: "workspace",
            workspaceId: "default-workspace"
          }
        ])
      ],
      [`${apiBaseUrl}/conversations?workspaceId=default-workspace`]: [
        jsonResponse(200, [
          {
            archivedAt: null,
            id: "conv_phase_d",
            isPinned: false,
            mode: "group",
            ownerUserId: "user_demo",
            participants: [
              { agentId: "agent_tech_lead", agentName: "技术负责人" },
              { agentId: "agent_engineer", agentName: "软件工程师" }
            ],
            pinnedMessageIds: [],
            title: "实时频道",
            updatedAt: "2026-05-29T00:00:00.000Z",
            workspaceId: "default-workspace"
          }
        ])
      ],
      [`${apiBaseUrl}/messages?conversationId=conv_phase_d&workspaceId=default-workspace`]: [
        jsonResponse(200, [
          {
            content: "已有历史消息",
            conversationId: "conv_phase_d",
            createdAt: "2026-05-29T00:00:00.000Z",
            id: "msg_history",
            isPinned: false,
            mentionedAgentIds: [],
            ownerUserId: "user_demo",
            role: "assistant",
            sourceAgentId: "agent_tech_lead",
            workspaceId: "default-workspace"
          }
        ]),
        jsonResponse(200, [
          {
            content: "已有历史消息",
            conversationId: "conv_phase_d",
            createdAt: "2026-05-29T00:00:00.000Z",
            id: "msg_history",
            isPinned: false,
            mentionedAgentIds: [],
            ownerUserId: "user_demo",
            role: "assistant",
            sourceAgentId: "agent_tech_lead",
            workspaceId: "default-workspace"
          },
          {
            content: "请开始执行下一步。",
            conversationId: "conv_phase_d",
            createdAt: "2026-05-29T00:00:01.000Z",
            id: "msg_user",
            isPinned: false,
            mentionedAgentIds: [],
            ownerUserId: "user_demo",
            role: "user",
            sourceAgentId: null,
            workspaceId: "default-workspace"
          },
          {
            content: "收到，先整理计划。",
            conversationId: "conv_phase_d",
            createdAt: "2026-05-29T00:00:02.000Z",
            id: "msg_assistant",
            isPinned: false,
            mentionedAgentIds: [],
            ownerUserId: "user_demo",
            role: "assistant",
            sourceAgentId: "agent_tech_lead",
            workspaceId: "default-workspace"
          }
        ])
      ],
      [`${apiBaseUrl}/channel-files?channelId=conv_phase_d&workspaceId=default-workspace`]: [
        jsonResponse(200, [])
      ],
      [`${apiBaseUrl}/activity?channelId=conv_phase_d&workspaceId=default-workspace`]: [
        jsonResponse(200, [])
      ],
      [`${apiBaseUrl}/approvals?channelId=conv_phase_d&workspaceId=default-workspace`]: [
        jsonResponse(200, [])
      ],
      [`${apiBaseUrl}/coding-workflows?conversationId=conv_phase_d&workspaceId=default-workspace`]: [
        jsonResponse(200, null)
      ],
      [`${apiBaseUrl}/messages/send`]: [
        jsonResponse(202, {
          content: "请开始执行下一步。",
          conversationId: "conv_phase_d",
          createdAt: "2026-05-29T00:00:01.000Z",
          id: "msg_user",
          isPinned: false,
          mentionedAgentIds: [],
          ownerUserId: "user_demo",
          role: "user",
          sourceAgentId: null,
          workspaceId: "default-workspace"
        })
      ]
    });

    render(<ChannelShell channelId="conv_phase_d" />);

    expect(await screen.findByText("已有历史消息")).toBeInTheDocument();
    expect(await screen.findByLabelText("消息内容")).toBeInTheDocument();
    expect(MockEventSource.instances[0]?.url).toBe(
      "/api/streams/conv_phase_d?workspaceId=default-workspace"
    );

    MockEventSource.instances[0]?.emitOpen();
    await screen.findByText("流状态：已连接");

    fireEvent.change(screen.getByLabelText("消息内容"), {
      target: { value: "请开始执行下一步。" }
    });
    fireEvent.click(screen.getByRole("button", { name: "发送消息" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        `${apiBaseUrl}/messages/send`,
        expect.objectContaining({
          credentials: "include",
          method: "POST"
        })
      );
    });
    expect(await screen.findByText("请开始执行下一步。")).toBeInTheDocument();
    expect(await screen.findByText("AI 同事正在处理你的消息")).toBeInTheDocument();

    MockEventSource.instances[0]?.emitMessage({
      kind: "conversation.message.started",
      payload: {
        messageId: "msg_assistant"
      }
    });
    MockEventSource.instances[0]?.emitMessage({
      kind: "conversation.message.delta",
      payload: {
        delta: "收到，",
        messageId: "msg_assistant"
      }
    });
    expect(await screen.findByText("收到，")).toBeInTheDocument();

    MockEventSource.instances[0]?.emitMessage({
      kind: "conversation.message.completed",
      payload: {
        finalContent: "收到，先整理计划。",
        messageId: "msg_assistant"
      }
    });

    expect(await screen.findByText("收到，先整理计划。")).toBeInTheDocument();
  });

  it("falls back to refreshing persisted replies when stream completion is missed", async () => {
    mockFetchByUrl({
      [`${apiBaseUrl}/workspaces`]: [
        jsonResponse(200, [
          {
            createdAt: "2026-05-29T00:00:00.000Z",
            id: "default-workspace",
            name: "默认工作区",
            ownerUserId: "user_demo",
            updatedAt: "2026-05-29T00:00:00.000Z"
          }
        ])
      ],
      [`${apiBaseUrl}/channels?workspaceId=default-workspace`]: [
        jsonResponse(200, [
          {
            conversationId: "conv_deepseek_direct",
            id: "conv_deepseek_direct",
            memberTeammateIds: ["agent_engineer"],
            sourceType: "conversation",
            summary: "1 位协作成员共享这个频道。",
            title: "软件工程师 session",
            unreadCount: 0,
            updatedAt: "2026-05-29T00:00:00.000Z",
            visibility: "workspace",
            workspaceId: "default-workspace"
          }
        ])
      ],
      [`${apiBaseUrl}/conversations?workspaceId=default-workspace`]: [
        jsonResponse(200, [
          {
            archivedAt: null,
            id: "conv_deepseek_direct",
            isPinned: false,
            mode: "direct",
            ownerUserId: "user_demo",
            participants: [{ agentId: "agent_engineer", agentName: "软件工程师" }],
            pinnedMessageIds: [],
            title: "软件工程师 session",
            updatedAt: "2026-05-29T00:00:00.000Z",
            workspaceId: "default-workspace"
          }
        ])
      ],
      [`${apiBaseUrl}/messages?conversationId=conv_deepseek_direct&workspaceId=default-workspace`]: [
        jsonResponse(200, []),
        jsonResponse(200, [
          {
            content: "请告诉我现在你可以收到我的信息吗？",
            conversationId: "conv_deepseek_direct",
            createdAt: "2026-05-29T00:00:01.000Z",
            id: "msg_user",
            isPinned: false,
            mentionedAgentIds: [],
            ownerUserId: "user_demo",
            role: "user",
            sourceAgentId: null,
            workspaceId: "default-workspace"
          },
          {
            content: "收到了！你的信息我都能看到。",
            conversationId: "conv_deepseek_direct",
            createdAt: "2026-05-29T00:00:02.000Z",
            id: "msg_assistant",
            isPinned: false,
            mentionedAgentIds: [],
            ownerUserId: "user_demo",
            role: "assistant",
            sourceAgentId: "agent_engineer",
            workspaceId: "default-workspace"
          }
        ])
      ],
      [`${apiBaseUrl}/channel-files?channelId=conv_deepseek_direct&workspaceId=default-workspace`]: [
        jsonResponse(200, [])
      ],
      [`${apiBaseUrl}/activity?channelId=conv_deepseek_direct&workspaceId=default-workspace`]: [
        jsonResponse(200, [])
      ],
      [`${apiBaseUrl}/approvals?channelId=conv_deepseek_direct&workspaceId=default-workspace`]: [
        jsonResponse(200, [])
      ],
      [`${apiBaseUrl}/coding-workflows?conversationId=conv_deepseek_direct&workspaceId=default-workspace`]: [
        jsonResponse(200, null)
      ],
      [`${apiBaseUrl}/messages/send`]: [
        jsonResponse(202, {
          content: "请告诉我现在你可以收到我的信息吗？",
          conversationId: "conv_deepseek_direct",
          createdAt: "2026-05-29T00:00:01.000Z",
          id: "msg_user",
          isPinned: false,
          mentionedAgentIds: [],
          ownerUserId: "user_demo",
          role: "user",
          sourceAgentId: null,
          workspaceId: "default-workspace"
        })
      ]
    });

    render(<ChannelShell channelId="conv_deepseek_direct" />);

    expect(await screen.findByText("软件工程师 session")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("消息内容"), {
      target: { value: "请告诉我现在你可以收到我的信息吗？" }
    });
    fireEvent.click(screen.getByRole("button", { name: "发送消息" }));

    expect(await screen.findByText("请告诉我现在你可以收到我的信息吗？")).toBeInTheDocument();
    expect(
      await screen.findByText("收到了！你的信息我都能看到。", {}, { timeout: 2_500 })
    ).toBeInTheDocument();
  });
});

function mockFetchByUrl(mapping: Record<string, Response[]>) {
  fetchMock.mockImplementation(async (input, init) => {
    const url = typeof input === "string" ? input : input.url;
    const method = typeof init === "object" && init !== null && "method" in init ? init.method : "GET";

    if (
      method &&
      method !== "GET" &&
      url !== `${apiBaseUrl}/messages/send` &&
      !url.endsWith("/presence") &&
      !url.endsWith("/read-state") &&
      !url.endsWith("/reactions")
    ) {
      throw new Error(`Unexpected non-GET fetch in ChannelShell test: ${method} ${url}`);
    }

    if (method && method !== "GET" && url.endsWith("/read-state")) {
      return jsonResponse(200, {
        channelId: "channel",
        lastReadAt: "2026-05-29T00:00:00.000Z",
        lastReadMessageId: null,
        notificationPreference: "all",
        unreadCount: 0,
        workspaceId: "default-workspace"
      });
    }

    if (method && method !== "GET" && url.endsWith("/presence")) {
      return jsonResponse(202, {
        kind: "conversation.presence",
        payload: {}
      });
    }

    const queue = mapping[url];

    if (!queue || queue.length === 0) {
      if (/^\/api\/channels\/[^/]+\/members\?workspaceId=/.test(url)) {
        return jsonResponse(200, {
          aiCount: 0,
          channelId: url.split("/channels/")[1]?.split("/members")[0] ?? "channel",
          humanCount: 0,
          members: [],
          totalCount: 0,
          workspaceId: "default-workspace"
        });
      }

      if (/^\/api\/channels\/[^/]+\/read-state\?workspaceId=/.test(url)) {
        return jsonResponse(200, {
          channelId: url.split("/channels/")[1]?.split("/read-state")[0] ?? "channel",
          lastReadAt: null,
          lastReadMessageId: null,
          notificationPreference: "all",
          unreadCount: 0,
          workspaceId: "default-workspace"
        });
      }

      if (/^\/api\/artifacts\?messageId=/.test(url)) {
        return jsonResponse(200, []);
      }

      if (url === `${apiBaseUrl}/workspace-member-directory?workspaceId=default-workspace`) {
        return jsonResponse(200, []);
      }

      if (/^\/api\/streams\/[^/]+\/presence\?workspaceId=/.test(url)) {
        return jsonResponse(200, {
          conversationId: "channel",
          participants: []
        });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    }

    return queue.shift()!;
  });
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: {
      "Content-Type": "application/json"
    },
    status
  });
}
