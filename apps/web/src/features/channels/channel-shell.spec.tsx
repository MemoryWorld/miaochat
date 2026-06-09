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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ChannelShell } from "./channel-shell";

const fetchMock = vi.fn<typeof fetch>();
const apiBaseUrl = "/api";
const routerPushMock = vi.fn();

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

  emitError() {
    this.onerror?.(new Event("error"));
  }

  emitOpen() {
    this.onopen?.(new Event("open"));
  }
}

vi.mock("next/navigation", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("next/navigation");
  return {
    ...actual,
    usePathname: () => "/channels/conv_phase_d",
    useRouter: () => ({
      push: routerPushMock
    })
  };
});

describe("ChannelShell", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("EventSource", MockEventSource);
    MockEventSource.instances = [];
    routerPushMock.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it("shows the login panel instead of an unavailable channel state when the workspace session is missing", async () => {
    mockFetchByUrl({
      [`${apiBaseUrl}/auth/session`]: [
        jsonResponse(200, {
          authenticated: false
        })
      ],
      [`${apiBaseUrl}/workspaces`]: [
        jsonResponse(401, {
          message: "请先登录后再继续操作。"
        })
      ]
    });

    render(<ChannelShell channelId="conv_phase_d" />);

    expect(await screen.findByRole("button", { name: "登录" })).toBeInTheDocument();
    expect(screen.getByText("请先登录后再继续操作。")).toBeInTheDocument();
    expect(screen.queryByText("频道不可用")).not.toBeInTheDocument();
    expect(screen.queryByText("当前频道概况")).not.toBeInTheDocument();
  });

  it("shows synchronization states before workspace-scoped chat surfaces can start loading", async () => {
    const workspacesResponse = createDeferred<Response>();

    mockFetchByUrl({
      [`${apiBaseUrl}/auth/session`]: [
        jsonResponse(200, {
          authenticated: false
        })
      ],
      [`${apiBaseUrl}/workspaces`]: [workspacesResponse.promise]
    });

    render(<ChannelShell channelId="conv_phase_d" />);

    expect(screen.getByText("正在同步频道概况...")).toBeInTheDocument();
    expect(screen.getByText("正在同步频道消息...")).toBeInTheDocument();
    expect(screen.getByText("正在同步频道成员...")).toBeInTheDocument();
    expect(screen.getAllByText("正在同步网页预览...").length).toBeGreaterThan(0);
    expect(screen.queryByText("AI 同事：0")).not.toBeInTheDocument();
    expect(screen.queryByText("审批：0")).not.toBeInTheDocument();
    expect(screen.queryByText("活动轮次：0")).not.toBeInTheDocument();
    expect(screen.queryByText(/0 条可见消息/)).not.toBeInTheDocument();
    expect(screen.queryByText(/0 位成员/)).not.toBeInTheDocument();
    expect(screen.queryByText("等待工程师生成真实 HTML 产物")).not.toBeInTheDocument();
    expect(screen.queryByText("还没有可预览产物")).not.toBeInTheDocument();

    workspacesResponse.resolve(
      jsonResponse(401, {
        message: "请先登录后再继续操作。"
      })
    );

    expect(await screen.findByRole("button", { name: "登录" })).toBeInTheDocument();
  });

  it("shows synchronization states before workspace-scoped file surfaces can start loading", async () => {
    const workspacesResponse = createDeferred<Response>();

    mockFetchByUrl({
      [`${apiBaseUrl}/auth/session`]: [
        jsonResponse(200, {
          authenticated: false
        })
      ],
      [`${apiBaseUrl}/workspaces`]: [workspacesResponse.promise]
    });

    render(<ChannelShell channelId="conv_phase_d" initialTab="files" />);

    expect(screen.getByText("正在加载文件")).toBeInTheDocument();
    expect(screen.queryByText("文件面为空")).not.toBeInTheDocument();
    expect(screen.queryByText("当前频道还没有产出文件。")).not.toBeInTheDocument();

    workspacesResponse.resolve(
      jsonResponse(401, {
        message: "请先登录后再继续操作。"
      })
    );

    expect(await screen.findByRole("button", { name: "登录" })).toBeInTheDocument();
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
            storageKey: "artifacts/default-workspace/msg_plan/plan.md",
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

  it("shows loading states instead of false empty states while channel surfaces hydrate", async () => {
    const messagesResponse = createDeferred<Response>();
    const rosterResponse = createDeferred<Response>();
    const filesResponse = createDeferred<Response>();

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
            memberTeammateIds: [],
            sourceType: "conversation",
            summary: "加载中状态测试",
            title: "加载中频道",
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
            title: "加载中频道",
            updatedAt: "2026-05-29T00:00:00.000Z",
            workspaceId: "default-workspace"
          }
        ])
      ],
      [`${apiBaseUrl}/channels/conv_phase_d/members?workspaceId=default-workspace`]: [
        rosterResponse.promise
      ],
      [`${apiBaseUrl}/messages?conversationId=conv_phase_d&workspaceId=default-workspace`]: [
        messagesResponse.promise
      ],
      [`${apiBaseUrl}/channel-files?channelId=conv_phase_d&workspaceId=default-workspace`]: [
        filesResponse.promise
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

    render(<ChannelShell channelId="conv_phase_d" />);

    expect(await screen.findByText("加载中频道")).toBeInTheDocument();
    expect(await screen.findByText("正在同步频道消息...")).toBeInTheDocument();
    expect(screen.getByText("正在同步频道成员...")).toBeInTheDocument();
    expect(screen.getAllByText("正在同步网页预览...").length).toBeGreaterThan(0);
    expect(screen.queryByText(/0 条可见消息/)).not.toBeInTheDocument();
    expect(screen.queryByText("AI 同事：0")).not.toBeInTheDocument();
    expect(screen.queryByText("等待工程师生成真实 HTML 产物")).not.toBeInTheDocument();
    expect(screen.queryByText("还没有可预览产物")).not.toBeInTheDocument();
    expect(screen.queryByText("还没有邀请其他同事。")).not.toBeInTheDocument();
    expect(screen.queryByText("还没有 AI 同事参与这个频道。")).not.toBeInTheDocument();

    rosterResponse.resolve(
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
            displayName: "软件工程师",
            kind: "ai",
            memberId: "ai:agent_engineer",
            permission: "comment",
            role: "ai_teammate",
            status: "available",
            teammateId: "agent_engineer"
          }
        ],
        totalCount: 2,
        workspaceId: "default-workspace"
      })
    );
    messagesResponse.resolve(
      jsonResponse(200, [
        {
          content: "已有真实消息",
          conversationId: "conv_phase_d",
          createdAt: "2026-05-29T00:00:00.000Z",
          id: "msg_existing",
          isPinned: false,
          mentionedAgentIds: [],
          ownerUserId: "user_demo",
          role: "assistant",
          sourceAgentId: "agent_engineer",
          workspaceId: "default-workspace"
        }
      ])
    );
    filesResponse.resolve(jsonResponse(200, []));

    expect(await screen.findByText("已有真实消息")).toBeInTheDocument();
    expect(screen.getByText("2 位成员 · 1 位同事 · 1 位 AI 同事")).toBeInTheDocument();
    expect(screen.getByText("还没有可预览产物")).toBeInTheDocument();
  });

  it("uses same-origin artifact links in the channel file surface", async () => {
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
            memberTeammateIds: ["agent_tech_lead"],
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
            id: "artifact_file_markdown",
            kind: "attachment",
            messageId: "msg_plan",
            mimeType: "text/markdown",
            previewUrl: null,
            storageKey: "artifacts/default-workspace/msg_plan/plan.md",
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
    expect(screen.getByRole("link", { name: "打开 计划附件 Markdown" })).toHaveAttribute(
      "href",
      "/artifacts/artifact_file_markdown?workspaceId=default-workspace"
    );
    expect(screen.getByRole("link", { name: "下载 计划附件" })).toHaveAttribute(
      "href",
      "/api/artifacts/artifact_file_markdown/file?workspaceId=default-workspace&disposition=attachment"
    );
  });

  it("renders the latest HTML artifact in the right preview panel through the content API", async () => {
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
            memberTeammateIds: [],
            sourceType: "conversation",
            summary: "网页预览测试",
            title: "网页预览频道",
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
            title: "网页预览频道",
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
            createdAt: "2026-05-29T00:00:02.000Z",
            id: "artifact_transformers_page",
            kind: "preview",
            messageId: "msg_engineer",
            mimeType: "text/html",
            previewUrl: "https://storage.example/unsigned.html",
            storageKey: "artifacts/default-workspace/msg_engineer/transformers.html",
            title: "变形金刚电影网页.html",
            workspaceId: "default-workspace"
          }
        ])
      ],
      [`${apiBaseUrl}/artifacts/artifact_transformers_page/content?workspaceId=default-workspace`]: [
        jsonResponse(200, {
          artifactId: "artifact_transformers_page",
          content: "<!doctype html><html><body><h1>变形金刚真人电影</h1></body></html>",
          mimeType: "text/html",
          title: "变形金刚电影网页.html",
          truncated: false
        })
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

    render(<ChannelShell channelId="conv_phase_d" />);

    expect(await screen.findByText("网页预览频道")).toBeInTheDocument();
    expect(await screen.findByText("变形金刚电影网页.html")).toBeInTheDocument();
    const previewFrame = await screen.findByTitle("变形金刚电影网页.html 预览");

    expect(previewFrame).toHaveAttribute(
      "srcdoc",
      expect.stringContaining("变形金刚真人电影")
    );
    expect(fetchMock).toHaveBeenCalledWith(
      `${apiBaseUrl}/artifacts/artifact_transformers_page/content?workspaceId=default-workspace`,
      expect.objectContaining({
        credentials: "include"
      })
    );
  });

  it("keeps the existing HTML preview visible when a later file surface refresh fails", async () => {
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
            memberTeammateIds: [],
            sourceType: "conversation",
            summary: "网页预览测试",
            title: "网页预览频道",
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
            title: "网页预览频道",
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
            createdAt: "2026-05-29T00:00:02.000Z",
            id: "artifact_transformers_page",
            kind: "preview",
            messageId: "msg_engineer",
            mimeType: "text/html",
            previewUrl: null,
            storageKey: "artifacts/default-workspace/msg_engineer/transformers.html",
            title: "变形金刚电影网页.html",
            workspaceId: "default-workspace"
          }
        ]),
        jsonResponse(500, {
          message: "请求失败。"
        })
      ],
      [`${apiBaseUrl}/artifacts/artifact_transformers_page/content?workspaceId=default-workspace`]: [
        jsonResponse(200, {
          artifactId: "artifact_transformers_page",
          content: "<!doctype html><html><body><h1>变形金刚真人电影</h1></body></html>",
          mimeType: "text/html",
          title: "变形金刚电影网页.html",
          truncated: false
        })
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

    render(<ChannelShell channelId="conv_phase_d" />);

    const previewFrame = await screen.findByTitle("变形金刚电影网页.html 预览");
    expect(previewFrame).toHaveAttribute(
      "srcdoc",
      expect.stringContaining("变形金刚真人电影")
    );

    fireEvent.click(screen.getByRole("button", { name: "刷新" }));

    await waitFor(() => {
      expect(screen.getByText("请求失败。")).toBeInTheDocument();
    });
    expect(screen.getByTitle("变形金刚电影网页.html 预览")).toHaveAttribute(
      "srcdoc",
      expect.stringContaining("变形金刚真人电影")
    );
    expect(screen.queryByText("等待工程师生成真实 HTML 产物")).not.toBeInTheDocument();
    expect(screen.queryByText("频道不可用")).not.toBeInTheDocument();
  });

  it("opens a newly created HTML artifact in the right preview panel after the stream event arrives", async () => {
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
            memberTeammateIds: [],
            sourceType: "conversation",
            summary: "网页预览测试",
            title: "网页预览频道",
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
            title: "网页预览频道",
            updatedAt: "2026-05-29T00:00:00.000Z",
            workspaceId: "default-workspace"
          }
        ])
      ],
      [`${apiBaseUrl}/messages?conversationId=conv_phase_d&workspaceId=default-workspace`]: [
        jsonResponse(200, [])
      ],
      [`${apiBaseUrl}/channel-files?channelId=conv_phase_d&workspaceId=default-workspace`]: [
        jsonResponse(200, []),
        jsonResponse(200, []),
        jsonResponse(200, [
          {
            channelId: "conv_phase_d",
            conversationId: "conv_phase_d",
            createdAt: "2026-05-29T00:00:02.000Z",
            id: "artifact_transformers_page",
            kind: "preview",
            messageId: "msg_engineer",
            mimeType: "text/html",
            previewUrl: null,
            storageKey: "artifacts/default-workspace/msg_engineer/transformers.html",
            title: "变形金刚电影网页.html",
            workspaceId: "default-workspace"
          }
        ])
      ],
      [`${apiBaseUrl}/artifacts?messageId=msg_engineer&workspaceId=default-workspace`]: [
        jsonResponse(200, [])
      ],
      [`${apiBaseUrl}/artifacts/artifact_transformers_page/content?workspaceId=default-workspace`]: [
        jsonResponse(200, {
          artifactId: "artifact_transformers_page",
          content: "<!doctype html><html><body><h1>变形金刚真人电影</h1></body></html>",
          mimeType: "text/html",
          title: "变形金刚电影网页.html",
          truncated: false
        })
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

    render(<ChannelShell channelId="conv_phase_d" />);

    expect(await screen.findByText("还没有可预览产物")).toBeInTheDocument();
    await waitFor(() => {
      expect(MockEventSource.instances.length).toBeGreaterThan(0);
    });

    MockEventSource.instances[0]?.emitMessage({
      kind: "conversation.status",
      payload: {
        artifactStatus: {
          artifactId: "artifact_transformers_page",
          messageId: "msg_engineer",
          status: "created",
          title: "变形金刚电影网页.html",
          type: "webpage"
        },
        failures: [],
        label: "coding.execution_started",
        state: "running",
        successfulAgentCount: 1,
        summary: "软件工程师已生成网页产物。",
        totalAgentCount: 4
      }
    });

    const previewFrame = await screen.findByTitle(
      "变形金刚电影网页.html 预览",
      {},
      {
        timeout: 3_000
      }
    );
    expect(previewFrame).toHaveAttribute(
      "srcdoc",
      expect.stringContaining("变形金刚真人电影")
    );
  });

  it("keeps refreshing surfaces after a completed stream message until persisted HTML appears", async () => {
    const userMessage = {
      content: "请创建一个变形金刚真人电影网页。",
      conversationId: "conv_phase_d",
      createdAt: "2026-05-29T00:00:00.000Z",
      id: "msg_user",
      isPinned: false,
      mentionedAgentIds: [],
      ownerUserId: "user_demo",
      role: "user",
      sourceAgentId: null,
      workspaceId: "default-workspace"
    };
    const assistantMessage = {
      content: "软件工程师已完成 HTML 网页产物。",
      conversationId: "conv_phase_d",
      createdAt: "2026-05-29T00:00:03.000Z",
      id: "msg_engineer",
      isPinned: false,
      mentionedAgentIds: [],
      ownerUserId: "user_demo",
      role: "assistant",
      sourceAgentId: "agent_engineer",
      workspaceId: "default-workspace"
    };

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
            memberTeammateIds: ["agent_engineer"],
            sourceType: "conversation",
            summary: "网页生成频道",
            title: "网页生成频道",
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
            participants: [{ agentId: "agent_engineer", agentName: "软件工程师" }],
            pinnedMessageIds: [],
            title: "网页生成频道",
            updatedAt: "2026-05-29T00:00:00.000Z",
            workspaceId: "default-workspace"
          }
        ]),
        jsonResponse(200, [
          {
            archivedAt: null,
            id: "conv_phase_d",
            isPinned: false,
            mode: "group",
            ownerUserId: "user_demo",
            participants: [{ agentId: "agent_engineer", agentName: "软件工程师" }],
            pinnedMessageIds: [],
            title: "网页生成频道",
            updatedAt: "2026-05-29T00:00:03.000Z",
            workspaceId: "default-workspace"
          }
        ])
      ],
      [`${apiBaseUrl}/messages?conversationId=conv_phase_d&workspaceId=default-workspace`]: [
        jsonResponse(200, [userMessage]),
        jsonResponse(200, [userMessage]),
        jsonResponse(200, [userMessage, assistantMessage])
      ],
      [`${apiBaseUrl}/channel-files?channelId=conv_phase_d&workspaceId=default-workspace`]: [
        jsonResponse(200, []),
        jsonResponse(200, [
          {
            channelId: "conv_phase_d",
            conversationId: "conv_phase_d",
            createdAt: "2026-05-29T00:00:03.000Z",
            id: "artifact_transformers_page",
            kind: "preview",
            messageId: "msg_engineer",
            mimeType: "text/html",
            previewUrl: null,
            storageKey: "artifacts/default-workspace/msg_engineer/transformers.html",
            title: "变形金刚电影网页.html",
            workspaceId: "default-workspace"
          }
        ])
      ],
      [`${apiBaseUrl}/activity?channelId=conv_phase_d&workspaceId=default-workspace`]: [
        jsonResponse(200, []),
        jsonResponse(200, [])
      ],
      [`${apiBaseUrl}/approvals?channelId=conv_phase_d&workspaceId=default-workspace`]: [
        jsonResponse(200, [])
      ],
      [`${apiBaseUrl}/coding-workflows?conversationId=conv_phase_d&workspaceId=default-workspace`]: [
        jsonResponse(200, {
          activePlanVersion: 1,
          approvalHistory: [],
          approvalState: "approved",
          conversationId: "conv_phase_d",
          createdAt: "2026-05-29T00:00:00.000Z",
          deadline: null,
          engineerAgentId: "agent_engineer",
          extraAgentIds: [],
          goal: "创建变形金刚真人电影网页。",
          id: "workflow_phase_d",
          kickoffMessageId: "msg_user",
          ownerUserId: "user_demo",
          planMessageId: "msg_plan",
          priority: "normal",
          qaAgentId: "agent_qa",
          repoContext: null,
          reviewerAgentId: "agent_reviewer",
          runtimeBackend: "enhanced-hermes",
          state: "execution_running",
          taskSnapshot: [],
          teammates: [
            {
              agentId: "agent_engineer",
              isBuiltIn: true,
              name: "软件工程师",
              role: "software_engineer",
              runtimeBackend: "enhanced-hermes"
            }
          ],
          techLeadAgentId: "agent_tech_lead",
          updatedAt: "2026-05-29T00:00:00.000Z",
          workspaceId: "default-workspace"
        }),
        jsonResponse(200, {
          activePlanVersion: 1,
          approvalHistory: [],
          approvalState: "approved",
          conversationId: "conv_phase_d",
          createdAt: "2026-05-29T00:00:00.000Z",
          deadline: null,
          engineerAgentId: "agent_engineer",
          extraAgentIds: [],
          goal: "创建变形金刚真人电影网页。",
          id: "workflow_phase_d",
          kickoffMessageId: "msg_user",
          ownerUserId: "user_demo",
          planMessageId: "msg_plan",
          priority: "normal",
          qaAgentId: "agent_qa",
          repoContext: null,
          reviewerAgentId: "agent_reviewer",
          runtimeBackend: "enhanced-hermes",
          state: "completed",
          taskSnapshot: [],
          teammates: [
            {
              agentId: "agent_engineer",
              isBuiltIn: true,
              name: "软件工程师",
              role: "software_engineer",
              runtimeBackend: "enhanced-hermes"
            }
          ],
          techLeadAgentId: "agent_tech_lead",
          updatedAt: "2026-05-29T00:00:03.000Z",
          workspaceId: "default-workspace"
        })
      ],
      [`${apiBaseUrl}/artifacts?messageId=msg_user&workspaceId=default-workspace`]: [
        jsonResponse(200, [])
      ],
      [`${apiBaseUrl}/artifacts?messageId=msg_engineer&workspaceId=default-workspace`]: [
        jsonResponse(200, [
          {
            createdAt: "2026-05-29T00:00:03.000Z",
            id: "artifact_transformers_page",
            kind: "preview",
            messageId: "msg_engineer",
            mimeType: "text/html",
            previewUrl: null,
            storageKey: "artifacts/default-workspace/msg_engineer/transformers.html",
            title: "变形金刚电影网页.html",
            workspaceId: "default-workspace"
          }
        ])
      ],
      [`${apiBaseUrl}/artifacts/artifact_transformers_page/content?workspaceId=default-workspace`]: [
        jsonResponse(200, {
          artifactId: "artifact_transformers_page",
          content: "<!doctype html><html><body><h1>变形金刚真人电影</h1></body></html>",
          mimeType: "text/html",
          title: "变形金刚电影网页.html",
          truncated: false
        })
      ]
    });

    render(<ChannelShell channelId="conv_phase_d" />);

    expect(await screen.findByText("请创建一个变形金刚真人电影网页。")).toBeInTheDocument();
    await waitFor(() => {
      expect(MockEventSource.instances.length).toBeGreaterThan(0);
    });

    MockEventSource.instances[0]?.emitMessage({
      kind: "conversation.message.completed",
      payload: {
        finalContent: "软件工程师已完成 HTML 网页产物。",
        messageId: "msg_engineer"
      }
    });

    expect(await screen.findByText("正在同步持久化结果")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByText("正在同步持久化结果")).not.toBeInTheDocument();
    });
    expect(screen.getByText("软件工程师已完成 HTML 网页产物。")).toBeInTheDocument();

    const previewFrame = await screen.findByTitle(
      "变形金刚电影网页.html 预览",
      {},
      {
        timeout: 3_000
      }
    );
    expect(previewFrame).toHaveAttribute(
      "srcdoc",
      expect.stringContaining("变形金刚真人电影")
    );
  });

  it("restores the processing indicator from running agent runs after reload", async () => {
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
            conversationId: "conv_running",
            id: "conv_running",
            memberTeammateIds: ["agent_planner", "agent_builder"],
            sourceType: "conversation",
            summary: "2 位协作成员共享这个频道。",
            title: "运行中频道",
            unreadCount: 0,
            updatedAt: "2026-06-06T00:19:38.000Z",
            visibility: "workspace",
            workspaceId: "default-workspace"
          }
        ])
      ],
      [`${apiBaseUrl}/conversations?workspaceId=default-workspace`]: [
        jsonResponse(200, [
          {
            archivedAt: null,
            id: "conv_running",
            isPinned: false,
            mode: "group",
            ownerUserId: "user_demo",
            participants: [
              { agentId: "agent_planner", agentName: "规划同事" },
              { agentId: "agent_builder", agentName: "实现同事" }
            ],
            pinnedMessageIds: [],
            title: "运行中频道",
            updatedAt: "2026-06-06T00:19:38.000Z",
            workspaceId: "default-workspace"
          }
        ])
      ],
      [`${apiBaseUrl}/messages?conversationId=conv_running&workspaceId=default-workspace`]: [
        jsonResponse(200, [
          {
            content: "请两位同事协作并生成 Markdown 交付物。",
            conversationId: "conv_running",
            createdAt: "2026-06-06T00:19:38.000Z",
            id: "msg_running_user",
            isPinned: false,
            mentionedAgentIds: [],
            ownerUserId: "user_demo",
            role: "user",
            sourceAgentId: null,
            workspaceId: "default-workspace"
          }
        ])
      ],
      [`${apiBaseUrl}/channels/conv_running/agent-runs?workspaceId=default-workspace`]: [
        jsonResponse(200, [
          {
            agentId: "agent_planner",
            artifactCount: 0,
            channelId: "conv_running",
            checkpoint: "context_prepared",
            contextSnapshotId: null,
            createdAt: "2026-06-06T00:19:38.000Z",
            id: "agent-run:planner",
            metadata: {},
            producedEventIds: [],
            provider: "deepseek",
            status: "running",
            turnId: "turn:planner",
            updatedAt: "2026-06-06T00:19:39.000Z",
            workspaceId: "default-workspace"
          }
        ])
      ],
      [`${apiBaseUrl}/channel-files?channelId=conv_running&workspaceId=default-workspace`]: [
        jsonResponse(200, [])
      ],
      [`${apiBaseUrl}/activity?channelId=conv_running&workspaceId=default-workspace`]: [
        jsonResponse(200, [])
      ],
      [`${apiBaseUrl}/approvals?channelId=conv_running&workspaceId=default-workspace`]: [
        jsonResponse(200, [])
      ],
      [`${apiBaseUrl}/coding-workflows?conversationId=conv_running&workspaceId=default-workspace`]: [
        jsonResponse(200, null)
      ]
    });

    render(<ChannelShell channelId="conv_running" />);

    expect(await screen.findByText("运行中频道")).toBeInTheDocument();
    expect(
      await screen.findAllByText("规划同事正在处理，最近进度：已准备上下文。")
    ).toHaveLength(2);
    expect(screen.getAllByText("当前同事：规划同事")).toHaveLength(2);
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

  it("shows a channel unavailable notice and disables sending when the current channel cannot load", async () => {
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
      [`${apiBaseUrl}/channels?workspaceId=default-workspace`]: [jsonResponse(200, [])],
      [`${apiBaseUrl}/conversations?workspaceId=default-workspace`]: [jsonResponse(200, [])],
      [`${apiBaseUrl}/messages?conversationId=conv_missing&workspaceId=default-workspace`]: [
        jsonResponse(404, {
          message: "频道不存在或已不可用。"
        })
      ],
      [`${apiBaseUrl}/channel-files?channelId=conv_missing&workspaceId=default-workspace`]: [
        jsonResponse(200, [])
      ],
      [`${apiBaseUrl}/activity?channelId=conv_missing&workspaceId=default-workspace`]: [
        jsonResponse(200, [])
      ],
      [`${apiBaseUrl}/approvals?channelId=conv_missing&workspaceId=default-workspace`]: [
        jsonResponse(200, [])
      ],
      [`${apiBaseUrl}/coding-workflows?conversationId=conv_missing&workspaceId=default-workspace`]: [
        jsonResponse(200, null)
      ]
    });

    render(<ChannelShell channelId="conv_missing" />);

    const notice = await screen.findByRole("alert");
    expect(notice).toHaveTextContent("频道不可用");
    expect(notice).toHaveTextContent("频道不存在或已不可用。");
    expect(notice).not.toHaveTextContent("channelId");
    await waitFor(() => {
      expect(screen.getByLabelText("消息内容")).toBeDisabled();
      expect(screen.getByRole("button", { name: "发送消息" })).toBeDisabled();
    });
  });

  it("keeps the channel composer editable but prevents sending while the realtime stream is connecting", async () => {
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
            conversationId: "conv_connecting",
            id: "conv_connecting",
            memberTeammateIds: ["agent_tech_lead"],
            sourceType: "conversation",
            summary: "1 位协作成员共享这个频道。",
            title: "连接中频道",
            unreadCount: 0,
            updatedAt: "2026-06-09T00:00:00.000Z",
            visibility: "workspace",
            workspaceId: "default-workspace"
          }
        ])
      ],
      [`${apiBaseUrl}/conversations?workspaceId=default-workspace`]: [
        jsonResponse(200, [
          {
            archivedAt: null,
            id: "conv_connecting",
            isPinned: false,
            mode: "group",
            ownerUserId: "user_demo",
            participants: [
              { agentId: "agent_tech_lead", agentName: "技术负责人" }
            ],
            pinnedMessageIds: [],
            title: "连接中频道",
            updatedAt: "2026-06-09T00:00:00.000Z",
            workspaceId: "default-workspace"
          }
        ])
      ],
      [`${apiBaseUrl}/messages?conversationId=conv_connecting&workspaceId=default-workspace`]: [
        jsonResponse(200, [
          {
            content: "已有历史消息",
            conversationId: "conv_connecting",
            createdAt: "2026-06-09T00:00:00.000Z",
            id: "msg_history",
            isPinned: false,
            mentionedAgentIds: [],
            ownerUserId: "user_demo",
            role: "assistant",
            sourceAgentId: "agent_tech_lead",
            workspaceId: "default-workspace"
          }
        ])
      ],
      [`${apiBaseUrl}/channel-files?channelId=conv_connecting&workspaceId=default-workspace`]: [
        jsonResponse(200, [])
      ],
      [`${apiBaseUrl}/activity?channelId=conv_connecting&workspaceId=default-workspace`]: [
        jsonResponse(200, [])
      ],
      [`${apiBaseUrl}/approvals?channelId=conv_connecting&workspaceId=default-workspace`]: [
        jsonResponse(200, [])
      ],
      [`${apiBaseUrl}/coding-workflows?conversationId=conv_connecting&workspaceId=default-workspace`]: [
        jsonResponse(200, null)
      ]
    });

    render(<ChannelShell channelId="conv_connecting" />);

    expect(await screen.findByText("已有历史消息")).toBeInTheDocument();
    await waitFor(() => {
      expect(MockEventSource.instances.length).toBeGreaterThan(0);
    });

    const textarea = screen.getByLabelText("消息内容");
    fireEvent.change(textarea, {
      target: {
        value: "实时流连接后再发"
      }
    });

    expect(textarea).not.toBeDisabled();
    expect(screen.getByText("正在连接实时流，稍后即可发送。")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "发送消息" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "发送消息" }));

    expect(
      fetchMock.mock.calls.some(([url]) => url === `${apiBaseUrl}/messages/send`)
    ).toBe(false);

    MockEventSource.instances[0]?.emitOpen();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "发送消息" })).toBeEnabled();
    });
    expect(textarea).toHaveValue("实时流连接后再发");
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

  it("routes to the independent visual workflow workbench from a natural-language workflow request", async () => {
    const launchedWorkflow = {
      conversationId: "conv_phase_d",
      createdAt: "2026-06-08T00:00:01.000Z",
      definition: {
        edges: [
          { from: "input_movie", id: "edge_input_collect", label: "电影名", to: "collect_material" },
          { from: "collect_material", id: "edge_collect_outline", label: "资料", to: "outline" }
        ],
        inputSchema: [
          {
            description: "用于资料收集和网页生成的电影名称。",
            key: "movieName",
            label: "电影名",
            placeholder: "例如：变形金刚真人电影",
            required: true
          }
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
          },
          {
            id: "outline",
            inputSummary: "接收结构化资料。",
            label: "大纲生成节点",
            outputSummary: "页面大纲。",
            role: "信息架构",
            type: "outline"
          }
        ],
        outputSchema: [
          { description: "最终网页文件。", key: "htmlArtifact", label: "HTML artifact", mimeType: "text/html" }
        ]
      },
      description:
        "对话触发 Workflow 验收：请创建一个新的编码 workflow。目标：做一个电影网页。请先由技术负责人拆解计划并等待我批准。",
      id: "visual_workflow_created",
      latestRun: null,
      ownerUserId: "user_demo",
      sourceMessageId: "msg_workflow_request",
      status: "preview",
      title: "做一个电影网页 workflow",
      updatedAt: "2026-06-08T00:00:01.000Z",
      workspaceId: "default-workspace"
    };

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
          content:
            "对话触发 Workflow 验收：请创建一个新的编码 workflow。目标：做一个电影网页。请先由技术负责人拆解计划并等待我批准。",
          conversationId: "conv_phase_d",
          createdAt: "2026-06-08T00:00:01.000Z",
          id: "msg_workflow_request",
          isPinned: false,
          launchedWorkflow,
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
    await waitFor(() => {
      expect(MockEventSource.instances.length).toBeGreaterThan(0);
    });
    MockEventSource.instances[0]?.emitOpen();

    fireEvent.change(screen.getByLabelText("消息内容"), {
      target: {
        value:
          "对话触发 Workflow 验收：请创建一个新的编码 workflow。目标：做一个电影网页。请先由技术负责人拆解计划并等待我批准。"
      }
    });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "发送消息" })).toBeEnabled();
    });
    fireEvent.click(screen.getByRole("button", { name: "发送消息" }));

    expect(await screen.findByText(/对话触发 Workflow 验收/)).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Workflow 预览" })).toBeInTheDocument();
    expect(screen.getByText(/输入节点：电影名/)).toBeInTheDocument();
    expect(screen.getByText(/资料收集节点/)).toBeInTheDocument();
    expect(screen.getByText(/大纲生成节点/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "打开工作台" })).toHaveAttribute(
      "href",
      "/workflows/visual_workflow_created?workspaceId=default-workspace"
    );
    expect(screen.queryByRole("button", { name: "执行 workflow" })).not.toBeInTheDocument();
    expect(routerPushMock).toHaveBeenCalledWith(
      "/workflows/visual_workflow_created?workspaceId=default-workspace"
    );
    expect(screen.queryByText("AI 同事正在处理你的消息")).not.toBeInTheDocument();
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
    await waitFor(() => {
      expect(MockEventSource.instances.length).toBeGreaterThan(0);
    });
    MockEventSource.instances[0]?.emitOpen();
    fireEvent.change(screen.getByLabelText("消息内容"), {
      target: { value: "请告诉我现在你可以收到我的信息吗？" }
    });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "发送消息" })).toBeEnabled();
    });
    fireEvent.click(screen.getByRole("button", { name: "发送消息" }));

    expect(await screen.findByText("请告诉我现在你可以收到我的信息吗？")).toBeInTheDocument();
    expect(
      await screen.findByText("收到了！你的信息我都能看到。", {}, { timeout: 2_500 })
    ).toBeInTheDocument();
  });

  it("keeps orchestrator status events out of the chat while persisted group replies clear pending", async () => {
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
            conversationId: "conv_group_live",
            id: "conv_group_live",
            memberTeammateIds: ["agent_planner", "agent_builder"],
            sourceType: "conversation",
            summary: "2 位协作成员共享这个频道。",
            title: "多人协作频道",
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
            id: "conv_group_live",
            isPinned: false,
            mode: "group",
            ownerUserId: "user_demo",
            participants: [
              { agentId: "agent_planner", agentName: "规划同事" },
              { agentId: "agent_builder", agentName: "实现同事" }
            ],
            pinnedMessageIds: [],
            title: "多人协作频道",
            updatedAt: "2026-05-29T00:00:00.000Z",
            workspaceId: "default-workspace"
          }
        ])
      ],
      [`${apiBaseUrl}/messages?conversationId=conv_group_live&workspaceId=default-workspace`]: [
        jsonResponse(200, []),
        jsonResponse(200, [
          {
            content: "请两位同事协作推进这个目标。",
            conversationId: "conv_group_live",
            createdAt: "2026-05-29T00:00:01.000Z",
            id: "msg_user_group",
            isPinned: false,
            mentionedAgentIds: [],
            ownerUserId: "user_demo",
            role: "user",
            sourceAgentId: null,
            workspaceId: "default-workspace"
          },
          {
            content: "规划同事已拆出执行路径。",
            conversationId: "conv_group_live",
            createdAt: "2026-05-29T00:00:02.000Z",
            id: "msg_assistant_planner",
            isPinned: false,
            mentionedAgentIds: [],
            ownerUserId: "user_demo",
            role: "assistant",
            sourceAgentId: "agent_planner",
            workspaceId: "default-workspace"
          },
          {
            content: "实现同事已补充落地步骤。",
            conversationId: "conv_group_live",
            createdAt: "2026-05-29T00:00:03.000Z",
            id: "msg_assistant_builder",
            isPinned: false,
            mentionedAgentIds: [],
            ownerUserId: "user_demo",
            role: "assistant",
            sourceAgentId: "agent_builder",
            workspaceId: "default-workspace"
          },
          {
            content: "规划同事已补充风险清单。",
            conversationId: "conv_group_live",
            createdAt: "2026-05-29T00:00:04.000Z",
            id: "msg_assistant_planner_followup",
            isPinned: false,
            mentionedAgentIds: [],
            ownerUserId: "user_demo",
            role: "assistant",
            sourceAgentId: "agent_planner",
            workspaceId: "default-workspace"
          },
          {
            content: "实现同事已确认下一步实现顺序。",
            conversationId: "conv_group_live",
            createdAt: "2026-05-29T00:00:05.000Z",
            id: "msg_assistant_builder_followup",
            isPinned: false,
            mentionedAgentIds: [],
            ownerUserId: "user_demo",
            role: "assistant",
            sourceAgentId: "agent_builder",
            workspaceId: "default-workspace"
          }
        ])
      ],
      [`${apiBaseUrl}/channel-files?channelId=conv_group_live&workspaceId=default-workspace`]: [
        jsonResponse(200, [])
      ],
      [`${apiBaseUrl}/activity?channelId=conv_group_live&workspaceId=default-workspace`]: [
        jsonResponse(200, [])
      ],
      [`${apiBaseUrl}/approvals?channelId=conv_group_live&workspaceId=default-workspace`]: [
        jsonResponse(200, [])
      ],
      [`${apiBaseUrl}/coding-workflows?conversationId=conv_group_live&workspaceId=default-workspace`]: [
        jsonResponse(200, null)
      ],
      [`${apiBaseUrl}/messages/send`]: [
        jsonResponse(202, {
          content: "请两位同事协作推进这个目标。",
          conversationId: "conv_group_live",
          createdAt: "2026-05-29T00:00:01.000Z",
          id: "msg_user_group",
          isPinned: false,
          mentionedAgentIds: [],
          ownerUserId: "user_demo",
          role: "user",
          sourceAgentId: null,
          workspaceId: "default-workspace"
        })
      ]
    });

    render(<ChannelShell channelId="conv_group_live" />);

    expect(await screen.findByText("多人协作频道")).toBeInTheDocument();
    await waitFor(() => {
      expect(MockEventSource.instances.length).toBeGreaterThan(0);
    });
    MockEventSource.instances[0]?.emitOpen();
    await screen.findByText("流状态：已连接");

    fireEvent.change(screen.getByLabelText("消息内容"), {
      target: { value: "请两位同事协作推进这个目标。" }
    });
    fireEvent.click(screen.getByRole("button", { name: "发送消息" }));

    expect(await screen.findByText("请两位同事协作推进这个目标。")).toBeInTheDocument();
    expect(await screen.findByText("AI 同事正在处理你的消息")).toBeInTheDocument();

    MockEventSource.instances[0]?.emitMessage({
      kind: "conversation.status",
      payload: {
        failures: [],
        label: "orchestrator.received",
        state: "running",
        successfulAgentCount: 0,
        summary: "ORCHESTRATOR RECEIVED Accepted the group request for 2 agents.",
        totalAgentCount: 2
      }
    });
    MockEventSource.instances[0]?.emitMessage({
      kind: "conversation.status",
      payload: {
        failures: [],
        label: "orchestrator.dispatched",
        state: "running",
        successfulAgentCount: 0,
        summary: "ORCHESTRATOR DISPATCHED Dispatching 2 agent tasks.",
        totalAgentCount: 2
      }
    });
    MockEventSource.instances[0]?.emitMessage({
      kind: "conversation.status",
      payload: {
        failures: [],
        label: "orchestrator.running",
        state: "running",
        successfulAgentCount: 0,
        summary: "ORCHESTRATOR RUNNING Waiting for 2 agent results.",
        totalAgentCount: 2
      }
    });
    MockEventSource.instances[0]?.emitMessage({
      kind: "conversation.status",
      payload: {
        failures: [],
        label: "orchestrator.aggregated",
        state: "succeeded",
        successfulAgentCount: 4,
        summary: "ORCHESTRATOR AGGREGATED Aggregated 4 of 2 agent results.",
        totalAgentCount: 2
      }
    });
    MockEventSource.instances[0]?.emitError();

    expect(
      await screen.findByText("规划同事已拆出执行路径。", {}, { timeout: 800 })
    ).toBeInTheDocument();
    expect(screen.getByText("实现同事已补充落地步骤。")).toBeInTheDocument();
    expect(screen.getByText("规划同事已补充风险清单。")).toBeInTheDocument();
    expect(screen.getByText("实现同事已确认下一步实现顺序。")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByText("AI 同事正在处理你的消息")).not.toBeInTheDocument();
    });
    expect(screen.queryByText(/ORCHESTRATOR RECEIVED/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/ORCHESTRATOR DISPATCHED/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/ORCHESTRATOR RUNNING/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/ORCHESTRATOR AGGREGATED/i)).not.toBeInTheDocument();
    expect(screen.queryByText("Accepted the group request for 2 agents.")).not.toBeInTheDocument();
    expect(screen.queryByText("Dispatching 2 agent tasks.")).not.toBeInTheDocument();
    expect(screen.queryByText("Waiting for 2 agent results.")).not.toBeInTheDocument();
    expect(screen.queryByText("Aggregated 4 of 2 agent results.")).not.toBeInTheDocument();
  });
});

function createDeferred<T>(): {
  promise: Promise<T>;
  reject: (reason?: unknown) => void;
  resolve: (value: T) => void;
} {
  let rejectDeferred: (reason?: unknown) => void = () => undefined;
  let resolveDeferred: (value: T) => void = () => undefined;
  const promise = new Promise<T>((resolve, reject) => {
    resolveDeferred = resolve;
    rejectDeferred = reject;
  });

  return {
    promise,
    reject: rejectDeferred,
    resolve: resolveDeferred
  };
}

function mockFetchByUrl(mapping: Record<string, Array<Promise<Response> | Response>>) {
  fetchMock.mockImplementation(async (input, init) => {
    const url = toRequestUrl(input);
    const method = typeof init === "object" && init !== null && "method" in init ? init.method : "GET";

    if (
      method &&
      method !== "GET" &&
      url !== `${apiBaseUrl}/messages/send` &&
      !/^\/api\/visual-workflows\/[^/]+\/(?:cancel|regenerate|runs)$/.test(url) &&
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

      if (/^\/api\/artifacts\/[^/]+\/content\?workspaceId=/.test(url)) {
        return jsonResponse(200, {
          artifactId: "artifact",
          content: "# 预览",
          mimeType: "text/markdown",
          title: "预览",
          truncated: false
        });
      }

      if (/^\/api\/channels\/[^/]+\/agent-runs\?workspaceId=/.test(url)) {
        return jsonResponse(200, []);
      }

      if (/^\/api\/visual-workflows\?/.test(url)) {
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

function toRequestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") {
    return input;
  }

  return input instanceof URL ? input.toString() : input.url;
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: {
      "Content-Type": "application/json"
    },
    status
  });
}
