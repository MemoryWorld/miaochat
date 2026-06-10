// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ChatExperience } from "./chat-experience";

const fetchMock = vi.fn<typeof fetch>();
const apiBaseUrl = "/api";
const routerPushMock = vi.fn();

vi.mock("next/navigation", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("next/navigation");
  return {
    ...actual,
    usePathname: () => "/channels/overview",
    useRouter: () => ({
      push: routerPushMock
    })
  };
});

class MockEventSource {
  static instances: MockEventSource[] = [];

  readonly close = vi.fn();
  onerror: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent<string>) => void) | null = null;
  onopen: ((event: Event) => void) | null = null;

  constructor() {
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

describe("ChatExperience", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("EventSource", MockEventSource);
    MockEventSource.instances = [];
    routerPushMock.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it("shows the login panel without false empty conversation or artifact states when the workspace session is missing", async () => {
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

    render(<ChatExperience />);

    expect(await screen.findByRole("link", { name: "前往设置登录" })).toHaveAttribute(
      "href",
      "/settings?section=profile"
    );
    expect(screen.getByText("请先登录后再继续操作。")).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "登录" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "退出登录" })).not.toBeInTheDocument();
    expect(screen.queryByText("频道列表")).not.toBeInTheDocument();
    expect(screen.queryByText("0 条")).not.toBeInTheDocument();
    expect(screen.queryByText(/当前频道还没有消息/)).not.toBeInTheDocument();
    expect(screen.queryByText("还没有可预览的 HTML 产物。")).not.toBeInTheDocument();
  });

  it("does not show the login panel when workspace loading briefly fails but the session is still authenticated", async () => {
    mockFetchByUrl({
      [`${apiBaseUrl}/auth/session`]: [
        jsonResponse(200, {
          authenticated: true,
          user: {
            displayName: "Phase A Demo",
            email: "phase-a-demo@example.com",
            id: "user_phase_a_demo"
          }
        })
      ],
      [`${apiBaseUrl}/conversations?workspaceId=default-workspace`]: [
        jsonResponse(200, [])
      ],
      [`${apiBaseUrl}/credentials/model-connections?workspaceId=default-workspace`]: [
        jsonResponse(200, [])
      ],
      [`${apiBaseUrl}/credentials?workspaceId=default-workspace`]: [
        jsonResponse(200, [])
      ],
      [`${apiBaseUrl}/workspaces`]: [
        jsonResponse(401, {
          message: "请先登录后再继续操作。"
        }),
        jsonResponse(200, [
          {
            createdAt: "2026-05-28T00:00:00.000Z",
            id: "default-workspace",
            name: "Phase A Demo Workspace",
            ownerUserId: "user_phase_a_demo",
            updatedAt: "2026-05-28T00:00:00.000Z"
          }
        ])
      ]
    });

    render(<ChatExperience />);

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.filter(([url]) => url === `${apiBaseUrl}/workspaces`)
      ).toHaveLength(2);
    });
    expect(screen.getByRole("heading", { name: "会话" })).toBeInTheDocument();
    expect(screen.queryByText("请先登录后再继续操作。")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "登录" })).not.toBeInTheDocument();
    expect(
      await screen.findByText(/当前工作区还没有可用模型连接/i)
    ).toBeInTheDocument();
  });

  it("does not show artifact empty states while the workspace session is still loading", () => {
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);

      if (url === `${apiBaseUrl}/workspaces`) {
        return new Promise<Response>(() => undefined);
      }

      throw new Error(`Unexpected fetch call while workspace is loading: ${url}`);
    });

    render(<ChatExperience />);

    expect(screen.queryByText("还没有可预览的 HTML 产物。")).not.toBeInTheDocument();
    expect(screen.queryByText("当前会话还没有文件产物。")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "网页预览" })).not.toBeInTheDocument();
  });

  it("shows setup-first guidance when the workspace has no model connection", async () => {
    mockFetchByUrl({
      [`${apiBaseUrl}/auth/session`]: [
        jsonResponse(200, { authenticated: false })
      ],
      [`${apiBaseUrl}/conversations?workspaceId=default-workspace`]: [
        jsonResponse(200, { authenticated: false }),
        jsonResponse(200, [])
      ],
      [`${apiBaseUrl}/credentials/model-connections?workspaceId=default-workspace`]: [
        jsonResponse(200, [])
      ],
      [`${apiBaseUrl}/workspaces`]: [
        jsonResponse(200, [])
      ]
    });

    render(<ChatExperience />);

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(
          ([url, options]) =>
            url === `${apiBaseUrl}/conversations?workspaceId=default-workspace` &&
            typeof options === "object" &&
            options !== null &&
            "credentials" in options &&
            options.credentials === "include"
        )
      ).toBe(true);
    });

    expect(await screen.findByRole("link", { name: "模型连接" })).toBeInTheDocument();
    expect(screen.getByText(/当前工作区还没有可用模型连接/i)).toBeInTheDocument();
    expect(screen.queryByText("身份与会话")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "登录" })).not.toBeInTheDocument();
    expect(
      screen.queryByText(/seeded mock direct conversation/i)
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/Start mock conversation/i)).not.toBeInTheDocument();
  });

  it("renders the workspace shell instead of the old chat-workspace framing", async () => {
    mockFetchByUrl({
      [`${apiBaseUrl}/auth/session`]: [
        jsonResponse(200, { authenticated: false })
      ],
      [`${apiBaseUrl}/conversations?workspaceId=default-workspace`]: [
        jsonResponse(200, [])
      ],
      [`${apiBaseUrl}/credentials/model-connections?workspaceId=default-workspace`]: [
        jsonResponse(200, [])
      ],
      [`${apiBaseUrl}/workspaces`]: [
        jsonResponse(200, [])
      ]
    });

    render(<ChatExperience />);

    expect(await screen.findByRole("link", { name: "Miaochat" })).toBeInTheDocument();
    expect(screen.queryByText("频道兼容视图")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "会话" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "网页预览" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "可视化 Workflow" })).toBeInTheDocument();
    const primaryNavigation = screen.getByRole("navigation", {
      name: "Primary workspace navigation"
    });

    expect(within(primaryNavigation).getByRole("link", { name: "会话" })).toBeInTheDocument();
    expect(within(primaryNavigation).getByRole("link", { name: "Workflow" })).toBeInTheDocument();
    expect(within(primaryNavigation).getByRole("link", { name: "模型连接" })).toBeInTheDocument();
    expect(within(primaryNavigation).queryByRole("link", { name: "收件箱" })).not.toBeInTheDocument();
    expect(within(primaryNavigation).queryByRole("link", { name: "任务" })).not.toBeInTheDocument();
    expect(within(primaryNavigation).queryByRole("link", { name: "频道" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "新建同事" })).not.toBeInTheDocument();
    expect(screen.queryByText("Chat Workspace")).not.toBeInTheDocument();
    expect(screen.queryByText("AgentHub")).not.toBeInTheDocument();
  });

  it("orders conversations by pinned status and recent activity while keeping archived conversations in the archive view", async () => {
    const pinnedConversation = createConversation({
      id: "conv_pinned",
      isPinned: true,
      title: "置顶需求",
      updatedAt: "2026-06-01T00:00:00.000Z"
    });
    const recentConversation = createConversation({
      id: "conv_recent",
      title: "最近活跃",
      updatedAt: "2026-06-09T00:00:00.000Z"
    });
    const oldConversation = createConversation({
      id: "conv_old",
      title: "普通旧会话",
      updatedAt: "2026-06-02T00:00:00.000Z"
    });
    const archivedConversation = createConversation({
      archivedAt: "2026-06-08T00:00:00.000Z",
      id: "conv_archived",
      title: "归档任务",
      updatedAt: "2026-06-10T00:00:00.000Z"
    });

    mockFetchByUrl({
      [`${apiBaseUrl}/conversations?workspaceId=default-workspace`]: [
        jsonResponse(200, [
          pinnedConversation,
          oldConversation,
          archivedConversation,
          recentConversation
        ])
      ],
      [`${apiBaseUrl}/conversations?workspaceId=default-workspace&includeArchived=true`]: [
        jsonResponse(200, [
          pinnedConversation,
          oldConversation,
          archivedConversation,
          recentConversation
        ])
      ],
      [`${apiBaseUrl}/credentials/model-connections?workspaceId=default-workspace`]: [
        jsonResponse(200, [])
      ],
      [`${apiBaseUrl}/messages?conversationId=conv_pinned&workspaceId=default-workspace`]: [
        jsonResponse(200, [])
      ],
      [`${apiBaseUrl}/coding-workflows?conversationId=conv_pinned&workspaceId=default-workspace`]: [
        jsonResponse(200, null)
      ],
      [`${apiBaseUrl}/workspaces`]: [
        jsonResponse(200, [
          {
            createdAt: "2026-05-28T00:00:00.000Z",
            id: "default-workspace",
            name: "默认工作区",
            ownerUserId: "user_demo",
            updatedAt: "2026-05-28T00:00:00.000Z"
          }
        ])
      ]
    });

    render(<ChatExperience />);

    const conversationList = await screen.findByTestId("conversation-list");
    expect(await within(conversationList).findByText("置顶需求")).toBeInTheDocument();
    await waitFor(() => {
      expect(within(conversationList).queryByText("归档任务")).not.toBeInTheDocument();
    });

    const activeConversationText = Array.from(conversationList.querySelectorAll("article"))
      .map((article) => article.textContent ?? "")
      .join("\n");
    expect(activeConversationText.indexOf("置顶需求")).toBeLessThan(
      activeConversationText.indexOf("最近活跃")
    );
    expect(activeConversationText.indexOf("最近活跃")).toBeLessThan(
      activeConversationText.indexOf("普通旧会话")
    );
    expect(
      screen.queryByText("归档会话将在 30 天后自动删除，请及时恢复需要保留的会话。")
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "查看归档会话" }));

    expect(
      await screen.findByText("归档会话将在 30 天后自动删除，请及时恢复需要保留的会话。")
    ).toBeInTheDocument();
    expect(await within(conversationList).findByText("归档任务")).toBeInTheDocument();
    expect(within(conversationList).queryByText("置顶需求")).not.toBeInTheDocument();
    expect(within(conversationList).queryByText("最近活跃")).not.toBeInTheDocument();
    expect(within(conversationList).queryByText("普通旧会话")).not.toBeInTheDocument();
  });

  it("restores the last selected conversation instead of jumping to the first timeline item", async () => {
    window.localStorage.setItem(
      "miaochat:last-conversation:default-workspace",
      "conv_current_test"
    );
    mockFetchByUrl({
      [`${apiBaseUrl}/auth/session`]: [
        jsonResponse(200, { authenticated: false })
      ],
      [`${apiBaseUrl}/conversations?workspaceId=default-workspace`]: [
        jsonResponse(200, [
          {
            archivedAt: null,
            id: "conv_old",
            isPinned: false,
            mode: "group",
            ownerUserId: "user_demo",
            participants: [],
            pinnedMessageIds: [],
            title: "旧频道",
            updatedAt: "2026-06-06T00:00:00.000Z",
            workspaceId: "default-workspace"
          },
          {
            archivedAt: null,
            id: "conv_current_test",
            isPinned: false,
            mode: "group",
            ownerUserId: "user_demo",
            participants: [],
            pinnedMessageIds: [],
            title: "当前测试频道",
            updatedAt: "2026-06-05T00:00:00.000Z",
            workspaceId: "default-workspace"
          }
        ])
      ],
      [`${apiBaseUrl}/credentials/model-connections?workspaceId=default-workspace`]: [
        jsonResponse(200, [])
      ],
      [`${apiBaseUrl}/messages?conversationId=conv_current_test&workspaceId=default-workspace`]: [
        jsonResponse(200, [])
      ],
      [`${apiBaseUrl}/coding-workflows?conversationId=conv_current_test&workspaceId=default-workspace`]: [
        jsonResponse(200, null)
      ],
      [`${apiBaseUrl}/workspaces`]: [
        jsonResponse(200, [
          {
            createdAt: "2026-05-28T00:00:00.000Z",
            id: "default-workspace",
            name: "默认工作区",
            ownerUserId: "user_demo",
            updatedAt: "2026-05-28T00:00:00.000Z"
          }
        ])
      ]
    });

    render(<ChatExperience />);

    expect(
      await screen.findByRole("heading", { name: "当前测试频道" })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "旧频道" })
    ).not.toBeInTheDocument();
  });

  it("keeps the selected home channel and messages when a later conversation refresh fails", async () => {
    const conversation = {
      archivedAt: null,
      id: "conv_current_test",
      isPinned: false,
      mode: "group",
      ownerUserId: "user_demo",
      participants: [{ agentId: "agent_current", agentName: "执行同事" }],
      pinnedMessageIds: [],
      title: "当前测试频道",
      updatedAt: "2026-06-06T00:00:00.000Z",
      workspaceId: "default-workspace"
    };
    const message = {
      content: "已有真实消息",
      conversationId: "conv_current_test",
      createdAt: "2026-06-06T00:00:01.000Z",
      id: "msg_existing",
      isPinned: false,
      mentionedAgentIds: [],
      ownerUserId: "user_demo",
      role: "assistant",
      sourceAgentId: "agent_current",
      workspaceId: "default-workspace"
    };

    mockFetchByUrl({
      [`${apiBaseUrl}/auth/session`]: [
        jsonResponse(200, {
          authenticated: true,
          user: {
            displayName: "Phase A Demo",
            email: "phase-a-demo@example.com",
            id: "user_phase_a_demo"
          }
        })
      ],
      [`${apiBaseUrl}/conversations?workspaceId=default-workspace`]: [
        jsonResponse(200, [conversation]),
        jsonResponse(500, {
          message: "无法加载会话。"
        })
      ],
	      [`${apiBaseUrl}/credentials/model-connections?workspaceId=default-workspace`]: [
	        jsonResponse(200, [
	          {
	            id: "model_conn_demo",
	            kind: "opencode_model",
	            label: "OpenCode 工作区连接",
	            model: "deepseek/deepseek-chat",
	            preset: "balanced",
	            status: "valid",
	            workspaceId: "default-workspace"
	          }
	        ])
	      ],
	      [`${apiBaseUrl}/credentials?workspaceId=default-workspace`]: [
	        jsonResponse(200, [createCredential("cred_opencode", "opencode", "valid")])
	      ],
	      [`${apiBaseUrl}/custom-agents?workspaceId=default-workspace`]: [
	        jsonResponse(200, [])
	      ],
      [`${apiBaseUrl}/messages?conversationId=conv_current_test&workspaceId=default-workspace`]: [
        jsonResponse(200, [message])
      ],
      [`${apiBaseUrl}/artifacts?messageId=msg_existing&workspaceId=default-workspace`]: [
        jsonResponse(200, [])
      ],
      [`${apiBaseUrl}/coding-workflows?conversationId=conv_current_test&workspaceId=default-workspace`]: [
        jsonResponse(200, null)
      ],
      [`${apiBaseUrl}/workspaces`]: [
        jsonResponse(200, [
          {
            createdAt: "2026-05-28T00:00:00.000Z",
            id: "default-workspace",
            name: "默认工作区",
            ownerUserId: "user_demo",
            updatedAt: "2026-05-28T00:00:00.000Z"
          }
        ])
      ]
    });

    render(<ChatExperience />);

    expect(
      await screen.findByRole("heading", { name: "当前测试频道" })
    ).toBeInTheDocument();
    expect(await screen.findByText("已有真实消息")).toBeInTheDocument();
    await waitFor(() => {
      expect(MockEventSource.instances.length).toBeGreaterThan(0);
    });

    MockEventSource.instances[0]?.emitMessage({
      kind: "conversation.status",
      payload: {
        failures: [],
        label: "orchestrator.running",
        state: "running",
        successfulAgentCount: 0,
        summary: "后台正在同步。",
        totalAgentCount: 1
      }
    });

    await waitFor(
      () => {
        expect(screen.getByText("无法加载会话。")).toBeInTheDocument();
      },
      {
        timeout: 2_500
      }
    );
    expect(screen.getByRole("heading", { name: "当前测试频道" })).toBeInTheDocument();
    expect(screen.getByText("已有真实消息")).toBeInTheDocument();
    expect(screen.getByText("1 条")).toBeInTheDocument();
    expect(screen.queryByText("请先登录后再继续操作。")).not.toBeInTheDocument();
  });

  it("keeps the home composer editable but prevents sending while the realtime stream is connecting", async () => {
    const conversation = {
      archivedAt: null,
      id: "conv_connecting",
      isPinned: false,
      mode: "group",
      ownerUserId: "user_phase_a_demo",
      participants: [],
      pinnedMessageIds: [],
      title: "连接中频道",
      updatedAt: "2026-06-09T00:00:00.000Z",
      workspaceId: "default-workspace"
    };

    mockFetchByUrl({
      [`${apiBaseUrl}/auth/session`]: [
        jsonResponse(200, {
          authenticated: true,
          user: {
            displayName: "Phase A Demo",
            email: "phase-a-demo@example.com",
            id: "user_phase_a_demo"
          }
        })
      ],
      [`${apiBaseUrl}/conversations?workspaceId=default-workspace`]: [
        jsonResponse(200, [conversation])
      ],
      [`${apiBaseUrl}/credentials/model-connections?workspaceId=default-workspace`]: [
        jsonResponse(200, [
          {
            id: "model_conn_demo",
            kind: "deepseek_api",
            label: "DeepSeek 工作区连接",
            model: "deepseek-chat",
            preset: "balanced",
            status: "valid",
            workspaceId: "default-workspace"
          }
        ])
      ],
      [`${apiBaseUrl}/custom-agents?workspaceId=default-workspace`]: [
        jsonResponse(200, [])
      ],
      [`${apiBaseUrl}/messages?conversationId=conv_connecting&workspaceId=default-workspace`]: [
        jsonResponse(200, [])
      ],
      [`${apiBaseUrl}/coding-workflows?conversationId=conv_connecting&workspaceId=default-workspace`]: [
        jsonResponse(200, null)
      ],
      [`${apiBaseUrl}/workspaces`]: [
        jsonResponse(200, [
          {
            createdAt: "2026-05-28T00:00:00.000Z",
            id: "default-workspace",
            name: "Phase A Demo Workspace",
            ownerUserId: "user_phase_a_demo",
            updatedAt: "2026-05-28T00:00:00.000Z"
          }
        ])
      ]
    });

    render(<ChatExperience />);

    expect(
      await screen.findByRole("heading", { name: "连接中频道" })
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(MockEventSource.instances.length).toBeGreaterThan(0);
    });

    const textarea = screen.getByLabelText("消息内容");
    fireEvent.change(textarea, {
      target: {
        value: "等实时流连接后再发送"
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
    expect(textarea).toHaveValue("等实时流连接后再发送");
  });

  it("sends selected Markdown attachments with the chat message payload", async () => {
    const conversation = {
      archivedAt: null,
      id: "conv_attachment",
      isPinned: false,
      mode: "direct",
      ownerUserId: "user_phase_a_demo",
      participants: [{ agentId: "agent_opencode", agentName: "OpenCode" }],
      pinnedMessageIds: [],
      title: "OpenCode",
      updatedAt: "2026-06-10T00:00:00.000Z",
      workspaceId: "default-workspace"
    };
    const sentMessage = {
      content: "帮我看看这份 md 里面写了什么",
      conversationId: "conv_attachment",
      createdAt: "2026-06-10T00:00:01.000Z",
      id: "msg_user_attachment",
      isPinned: false,
      mentionedAgentIds: [],
      mentionedUserIds: [],
      ownerUserId: "user_phase_a_demo",
      role: "user",
      sourceAgentId: null,
      workspaceId: "default-workspace"
    };
    const attachedArtifact = {
      createdAt: "2026-06-10T00:00:01.100Z",
      id: "artifact_weekly_course",
      kind: "attachment",
      messageId: "msg_user_attachment",
      mimeType: "text/markdown",
      previewUrl: "https://example.test/weekly-course.md",
      storageKey:
        "artifacts/default-workspace/msg_user_attachment/artifact_weekly_course/weekly-course.md",
      title: "weekly-course.md",
      workspaceId: "default-workspace"
    };

    mockFetchByUrl({
      [`${apiBaseUrl}/auth/session`]: [
        jsonResponse(200, {
          authenticated: true,
          user: {
            displayName: "Phase A Demo",
            email: "phase-a-demo@example.com",
            id: "user_phase_a_demo"
          }
        })
      ],
      [`${apiBaseUrl}/conversations?workspaceId=default-workspace`]: [
        jsonResponse(200, [conversation])
      ],
      [`${apiBaseUrl}/credentials/model-connections?workspaceId=default-workspace`]: [
        jsonResponse(200, [
          {
            id: "model_conn_demo",
            kind: "opencode_model",
            label: "OpenCode 工作区连接",
            model: "deepseek/deepseek-chat",
            preset: "balanced",
            status: "valid",
            workspaceId: "default-workspace"
          }
        ])
      ],
      [`${apiBaseUrl}/credentials?workspaceId=default-workspace`]: [
        jsonResponse(200, [createCredential("cred_opencode", "opencode", "valid")])
      ],
      [`${apiBaseUrl}/custom-agents?workspaceId=default-workspace`]: [
        jsonResponse(200, [])
      ],
      [`${apiBaseUrl}/messages?conversationId=conv_attachment&workspaceId=default-workspace`]: [
        jsonResponse(200, [])
      ],
      [`${apiBaseUrl}/coding-workflows?conversationId=conv_attachment&workspaceId=default-workspace`]: [
        jsonResponse(200, null)
      ],
      [`${apiBaseUrl}/messages/send`]: [
        jsonResponse(202, sentMessage)
      ],
      [`${apiBaseUrl}/artifacts?messageId=msg_user_attachment&workspaceId=default-workspace`]: [
        jsonResponse(200, [attachedArtifact])
      ],
      [`${apiBaseUrl}/workspaces`]: [
        jsonResponse(200, [
          {
            createdAt: "2026-05-28T00:00:00.000Z",
            id: "default-workspace",
            name: "Phase A Demo Workspace",
            ownerUserId: "user_phase_a_demo",
            updatedAt: "2026-05-28T00:00:00.000Z"
          }
        ])
      ]
    });

    render(<ChatExperience />);

    expect(await screen.findByRole("heading", { name: "OpenCode" })).toBeInTheDocument();
    await waitFor(() => {
      expect(MockEventSource.instances.length).toBeGreaterThan(0);
    });
    MockEventSource.instances[0]?.emitOpen();

    const file = new File(
      ["# 本周课程\n\n- 讲解 AgentHub 多 Agent 协作平台。"],
      "weekly-course.md",
      { type: "text/markdown" }
    );
    fireEvent.change(screen.getByLabelText("选择文件"), {
      target: {
        files: [file]
      }
    });
    fireEvent.change(screen.getByLabelText("消息内容"), {
      target: {
        value: "帮我看看这份 md 里面写了什么"
      }
    });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "发送消息" })).toBeEnabled();
    });
    fireEvent.click(screen.getByRole("button", { name: "发送消息" }));

    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([url]) => url === `${apiBaseUrl}/messages/send`))
        .toBe(true);
    });

    const sendCall = fetchMock.mock.calls.find(([url]) => url === `${apiBaseUrl}/messages/send`);
    const sendBody = JSON.parse(
      String(sendCall?.[1] && "body" in sendCall[1] ? sendCall[1].body : "{}")
    ) as { attachments?: Array<{ content: string; fileName: string; mimeType: string }> };

    expect(sendBody.attachments).toEqual([
      {
        content: "# 本周课程\n\n- 讲解 AgentHub 多 Agent 协作平台。",
        fileName: "weekly-course.md",
        mimeType: "text/markdown"
      }
    ]);
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        `${apiBaseUrl}/artifacts?messageId=msg_user_attachment&workspaceId=default-workspace`,
        expect.objectContaining({
          credentials: "include"
        })
      );
    });
    expect(await screen.findAllByText("weekly-course.md")).toHaveLength(2);
  });

  it("routes to the visual workflow workbench when a natural-language channel message creates one", async () => {
    const teammates = [
      {
        agentId: "agent_tech_lead",
        isBuiltIn: true,
        name: "技术负责人",
        role: "tech_lead",
        runtimeBackend: "enhanced-hermes"
      },
      {
        agentId: "agent_engineer",
        isBuiltIn: true,
        name: "软件工程师",
        role: "software_engineer",
        runtimeBackend: "enhanced-hermes"
      },
      {
        agentId: "agent_reviewer",
        isBuiltIn: true,
        name: "代码评审工程师",
        role: "code_reviewer",
        runtimeBackend: "enhanced-hermes"
      },
      {
        agentId: "agent_qa",
        isBuiltIn: true,
        name: "质量保障测试工程师",
        role: "qa_tester",
        runtimeBackend: "enhanced-hermes"
      }
    ];
    const sourceConversation = {
      archivedAt: null,
      id: "conv_current_test",
      isPinned: false,
      mode: "group",
      ownerUserId: "user_phase_a_demo",
      participants: [{ agentId: "agent_source", agentName: "执行同事" }],
      pinnedMessageIds: [],
      title: "普通频道",
      updatedAt: "2026-06-08T00:00:00.000Z",
      workspaceId: "default-workspace"
    };
    const workflow = {
      activePlanVersion: 1,
      approvalHistory: [],
      approvalState: "pending",
      conversationId: "conv_created_workflow",
      createdAt: "2026-06-08T00:00:02.000Z",
      deadline: null,
      engineerAgentId: "agent_engineer",
      executionStageAssignments: [
        { agentId: "agent_engineer", role: "software_engineer" },
        { agentId: "agent_reviewer", role: "code_reviewer" },
        { agentId: "agent_qa", role: "qa_tester" }
      ],
      extraAgentIds: [],
      goal: "做一个电影网页",
      id: "workflow_created",
      kickoffMessageId: "msg_kickoff",
      ownerUserId: "user_phase_a_demo",
      planMessageId: "msg_plan",
      planningRole: "tech_lead",
      planningTeammateId: "agent_tech_lead",
      priority: "normal",
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
        },
        {
          id: "execution:software_engineer",
          ownerRole: "software_engineer",
          state: "todo",
          title: "软件工程师按计划实现"
        },
        {
          id: "execution:code_reviewer",
          ownerRole: "code_reviewer",
          state: "todo",
          title: "代码评审工程师检查风险与回归"
        },
        {
          id: "execution:qa_tester",
          ownerRole: "qa_tester",
          state: "todo",
          title: "质量保障测试工程师完成验证"
        },
        {
          id: "summary:tech_lead",
          ownerRole: "tech_lead",
          state: "todo",
          title: "技术负责人汇总完成度"
        }
      ],
      teammates,
      techLeadAgentId: "agent_tech_lead",
      updatedAt: "2026-06-08T00:00:02.000Z",
      workspaceId: "default-workspace"
    };
    const kickoffMessage = {
      content: "你们现在进入一条新的网页制作协作会话。\n本次目标：做一个电影网页",
      conversationId: "conv_created_workflow",
      createdAt: "2026-06-08T00:00:03.000Z",
      id: "msg_kickoff",
      isPinned: false,
      mentionedAgentIds: ["agent_tech_lead"],
      ownerUserId: "user_phase_a_demo",
      role: "user",
      sourceAgentId: null,
      workspaceId: "default-workspace"
    };
    const planMessage = {
      content: "# 技术负责人 计划建议\n\n先拆首屏、内容区、响应式和交付物，再等待用户批准。",
      conversationId: "conv_created_workflow",
      createdAt: "2026-06-08T00:00:04.000Z",
      id: "msg_plan",
      isPinned: false,
      mentionedAgentIds: [],
      ownerUserId: "user_phase_a_demo",
      role: "assistant",
      sourceAgentId: "agent_tech_lead",
      workspaceId: "default-workspace"
    };
    const launchedWorkflow = {
      conversationId: "conv_current_test",
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
            id: "output_html",
            inputSummary: "接收通过 QA 的 HTML。",
            label: "输出节点：HTML artifact",
            outputSummary: "可下载网页。",
            role: "文件输出",
            type: "output"
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
      ownerUserId: "user_phase_a_demo",
      sourceMessageId: "msg_workflow_request",
      status: "preview",
      title: "做一个电影网页 workflow",
      updatedAt: "2026-06-08T00:00:01.000Z",
      workspaceId: "default-workspace"
    };

    mockFetchByUrl({
      [`${apiBaseUrl}/auth/session`]: [
        jsonResponse(200, {
          authenticated: true,
          user: {
            displayName: "Phase A Demo",
            email: "phase-a-demo@example.com",
            id: "user_phase_a_demo"
          }
        })
      ],
      [`${apiBaseUrl}/conversations?workspaceId=default-workspace`]: [
        jsonResponse(200, [sourceConversation])
      ],
      [`${apiBaseUrl}/credentials/model-connections?workspaceId=default-workspace`]: [
        jsonResponse(200, [
          {
            id: "model_conn_demo",
            kind: "deepseek_api",
            label: "DeepSeek 工作区连接",
            model: "deepseek-chat",
            preset: "balanced",
            status: "valid",
            workspaceId: "default-workspace"
          }
        ])
      ],
      [`${apiBaseUrl}/custom-agents?workspaceId=default-workspace`]: [
        jsonResponse(200, [])
      ],
      [`${apiBaseUrl}/messages?conversationId=conv_current_test&workspaceId=default-workspace`]: [
        jsonResponse(200, [])
      ],
      [`${apiBaseUrl}/coding-workflows?conversationId=conv_current_test&workspaceId=default-workspace`]: [
        jsonResponse(200, null)
      ],
      [`${apiBaseUrl}/messages/send`]: [
        jsonResponse(202, {
          content:
            "对话触发 Workflow 验收：请创建一个新的编码 workflow。目标：做一个电影网页。请先由技术负责人拆解计划并等待我批准。",
          conversationId: "conv_current_test",
          createdAt: "2026-06-08T00:00:01.000Z",
          id: "msg_workflow_request",
          isPinned: false,
          launchedWorkflow,
          mentionedAgentIds: [],
          ownerUserId: "user_phase_a_demo",
          role: "user",
          sourceAgentId: null,
          workspaceId: "default-workspace"
        })
      ],
      [`${apiBaseUrl}/messages?conversationId=conv_created_workflow&workspaceId=default-workspace`]:
        [jsonResponse(200, [kickoffMessage, planMessage])],
      [`${apiBaseUrl}/artifacts?messageId=msg_kickoff&workspaceId=default-workspace`]: [
        jsonResponse(200, [])
      ],
      [`${apiBaseUrl}/artifacts?messageId=msg_plan&workspaceId=default-workspace`]: [
        jsonResponse(200, [])
      ],
      [`${apiBaseUrl}/coding-workflows?conversationId=conv_created_workflow&workspaceId=default-workspace`]:
        [jsonResponse(200, workflow)],
      [`${apiBaseUrl}/workspaces`]: [
        jsonResponse(200, [
          {
            createdAt: "2026-05-28T00:00:00.000Z",
            id: "default-workspace",
            name: "Phase A Demo Workspace",
            ownerUserId: "user_phase_a_demo",
            updatedAt: "2026-05-28T00:00:00.000Z"
          }
        ])
      ]
    });

    render(<ChatExperience />);

    expect(await screen.findByRole("heading", { name: "普通频道" })).toBeInTheDocument();
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

    expect(await screen.findByRole("heading", { name: "普通频道" })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Workflow 预览" })).toBeInTheDocument();
    expect(screen.getByText(/输入节点：电影名/)).toBeInTheDocument();
    expect(screen.getByText(/输出节点：HTML artifact/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "打开工作台" })).toHaveAttribute(
      "href",
      "/workflows/visual_workflow_created?workspaceId=default-workspace"
    );
    expect(routerPushMock).toHaveBeenCalledWith(
      "/workflows/visual_workflow_created?workspaceId=default-workspace"
    );
    expect(screen.queryByRole("button", { name: "执行 workflow" })).not.toBeInTheDocument();
    expect(screen.queryByText("计划门禁")).not.toBeInTheDocument();
    expect(screen.queryByText("AI 同事正在处理你的消息")).not.toBeInTheDocument();
  });

  it("shows platform choices and hides internal demo agents in the new-conversation flow", async () => {
    const customAgent = createAgent("agent_custom_builder", "网页制作 Agent", {
      capabilityTags: ["web", "custom"],
      provider: "opencode"
    });
    const internalAgent = createAgent("agent_phase_a_planner", "方案规划同事", {
      capabilityTags: ["phase-a", "demo"],
      provider: "deepseek"
    });

    mockFetchByUrl({
      [`${apiBaseUrl}/auth/session`]: [
        jsonResponse(200, {
          authenticated: true,
          user: {
            displayName: "Phase A Demo",
            email: "phase-a-demo@example.com",
            id: "user_phase_a_demo"
          }
        })
      ],
      [`${apiBaseUrl}/conversations?workspaceId=default-workspace`]: [
        jsonResponse(200, [])
      ],
      [`${apiBaseUrl}/credentials/model-connections?workspaceId=default-workspace`]: [
        jsonResponse(200, [
          {
            id: "model_conn_demo",
            kind: "opencode_model",
            label: "OpenCode 工作区连接",
            model: "deepseek/deepseek-chat",
            preset: "balanced",
            status: "valid",
            workspaceId: "default-workspace"
          }
        ])
      ],
      [`${apiBaseUrl}/credentials?workspaceId=default-workspace`]: [
        jsonResponse(200, [
          createCredential("cred_opencode", "opencode", "valid"),
          createCredential("cred_codex", "codex", "invalid")
        ])
      ],
      [`${apiBaseUrl}/custom-agents?workspaceId=default-workspace`]: [
        jsonResponse(200, [customAgent, internalAgent])
      ],
      [`${apiBaseUrl}/workspaces`]: [
        jsonResponse(200, [
          {
            createdAt: "2026-05-28T00:00:00.000Z",
            id: "default-workspace",
            name: "Phase A Demo Workspace",
            ownerUserId: "user_phase_a_demo",
            updatedAt: "2026-05-28T00:00:00.000Z"
          }
        ])
      ]
    });

    render(<ChatExperience />);

    fireEvent.click(await screen.findByRole("button", { name: "打开新建对话面板" }));

    expect(await screen.findByRole("button", { name: "关闭新建对话面板" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Codex/ })).toBeDisabled();
    expect(screen.getByRole("radio", { name: /Claude Code/ })).toBeDisabled();
    await waitFor(() => {
      expect(screen.getByRole("radio", { name: /OpenCode/ })).toBeEnabled();
    });
    await waitFor(() => {
      expect(screen.getByRole("radio", { name: /网页制作 Agent/ })).toBeEnabled();
    });
    expect(screen.getAllByText("平台自建 Agent").length).toBeGreaterThan(0);
    expect(screen.getAllByText("未连接，去模型连接").length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText("方案规划同事")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "群聊" }));
    const createButton = screen.getByRole("button", { name: "创建对话" });
    expect(createButton).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: /OpenCode/ }));
    expect(createButton).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: /网页制作 Agent/ }));
    expect(createButton).toBeEnabled();
  });

  it("enables OpenCode conversations when only a legacy DeepSeek credential is valid", async () => {
    mockFetchByUrl({
      [`${apiBaseUrl}/auth/session`]: [
        jsonResponse(200, {
          authenticated: true,
          user: {
            displayName: "Phase A Demo",
            email: "phase-a-demo@example.com",
            id: "user_phase_a_demo"
          }
        })
      ],
      [`${apiBaseUrl}/conversations?workspaceId=default-workspace`]: [
        jsonResponse(200, [])
      ],
      [`${apiBaseUrl}/credentials/model-connections?workspaceId=default-workspace`]: [
        jsonResponse(200, [
          {
            id: "model_conn_legacy_deepseek",
            kind: "deepseek_api",
            label: "DeepSeek 工作区连接",
            model: "deepseek-chat",
            preset: "balanced",
            status: "valid",
            workspaceId: "default-workspace"
          }
        ])
      ],
      [`${apiBaseUrl}/credentials?workspaceId=default-workspace`]: [
        jsonResponse(200, [createCredential("cred_deepseek", "deepseek", "valid")])
      ],
      [`${apiBaseUrl}/custom-agents?workspaceId=default-workspace`]: [
        jsonResponse(200, [])
      ],
      [`${apiBaseUrl}/workspaces`]: [
        jsonResponse(200, [
          {
            createdAt: "2026-05-28T00:00:00.000Z",
            id: "default-workspace",
            name: "Phase A Demo Workspace",
            ownerUserId: "user_phase_a_demo",
            updatedAt: "2026-05-28T00:00:00.000Z"
          }
        ])
      ]
    });

    render(<ChatExperience />);

    fireEvent.click(await screen.findByRole("button", { name: "打开新建对话面板" }));

    await waitFor(() => {
      expect(screen.getByRole("radio", { name: /OpenCode/ })).toBeEnabled();
    });
    expect(screen.getByRole("radio", { name: /Codex/ })).toBeDisabled();
    expect(screen.getByRole("radio", { name: /Claude Code/ })).toBeDisabled();
  });

  it("creates a default platform agent before creating a platform conversation", async () => {
    const createdAgent = createAgent("agent_codex_default", "Codex", {
      capabilityTags: ["platform-runtime-agent"],
      provider: "codex"
    });
    const createdConversation = {
      archivedAt: null,
      id: "conv_codex_platform",
      isPinned: false,
      mode: "direct",
      ownerUserId: "user_phase_a_demo",
      participants: [{ agentId: createdAgent.id, agentName: createdAgent.name }],
      pinnedMessageIds: [],
      title: "Codex频道",
      updatedAt: "2026-05-28T00:00:00.000Z",
      workspaceId: "default-workspace"
    };

    mockFetchByUrl({
      [`${apiBaseUrl}/auth/session`]: [
        jsonResponse(200, {
          authenticated: true,
          user: {
            displayName: "Phase A Demo",
            email: "phase-a-demo@example.com",
            id: "user_phase_a_demo"
          }
        })
      ],
      [`${apiBaseUrl}/conversations?workspaceId=default-workspace`]: [
        jsonResponse(200, [])
      ],
      [`${apiBaseUrl}/credentials/model-connections?workspaceId=default-workspace`]: [
        jsonResponse(200, [])
      ],
      [`${apiBaseUrl}/credentials?workspaceId=default-workspace`]: [
        jsonResponse(200, [createCredential("cred_codex", "codex", "valid")])
      ],
      [`${apiBaseUrl}/custom-agents?workspaceId=default-workspace`]: [
        jsonResponse(200, [])
      ],
      [`${apiBaseUrl}/custom-agents`]: [
        jsonResponse(201, createdAgent)
      ],
      [`${apiBaseUrl}/conversations`]: [
        jsonResponse(201, createdConversation)
      ],
      [`${apiBaseUrl}/messages?conversationId=conv_codex_platform&workspaceId=default-workspace`]:
        [jsonResponse(200, [])],
      [`${apiBaseUrl}/coding-workflows?conversationId=conv_codex_platform&workspaceId=default-workspace`]:
        [jsonResponse(200, null)],
      [`${apiBaseUrl}/workspaces`]: [
        jsonResponse(200, [
          {
            createdAt: "2026-05-28T00:00:00.000Z",
            id: "default-workspace",
            name: "Phase A Demo Workspace",
            ownerUserId: "user_phase_a_demo",
            updatedAt: "2026-05-28T00:00:00.000Z"
          }
        ])
      ]
    });

    render(<ChatExperience />);

    fireEvent.click(await screen.findByRole("button", { name: "打开新建对话面板" }));
    await waitFor(() => {
      expect(screen.getByRole("radio", { name: /Codex/ })).toBeEnabled();
    });
    const createButton = screen.getByRole("button", { name: "创建对话" });
    await waitFor(() => {
      expect(createButton).toBeEnabled();
    });
    fireEvent.click(screen.getByRole("button", { name: "创建对话" }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Codex频道" })).toBeInTheDocument();
    });

    const createAgentCall = fetchMock.mock.calls.find(
      ([url]) => url === `${apiBaseUrl}/custom-agents`
    );
    expect(createAgentCall).toBeDefined();
    expect(
      JSON.parse(
        String(createAgentCall?.[1] && "body" in createAgentCall[1] ? createAgentCall[1].body : "{}")
      )
    ).toMatchObject({
      capabilityTags: ["platform-runtime-agent"],
      modelProfileId: "cred_codex",
      name: "Codex",
      provider: "codex",
      workspaceId: "default-workspace"
    });

    const conversationCall = fetchMock.mock.calls.find(
      ([url]) => url === `${apiBaseUrl}/conversations`
    );
    expect(
      JSON.parse(
        String(conversationCall?.[1] && "body" in conversationCall[1] ? conversationCall[1].body : "{}")
      )
    ).toMatchObject({
      agentIds: [createdAgent.id],
      mode: "direct",
      workspaceId: "default-workspace"
    });
  });

  it("creates a direct conversation and requires a second confirmation before deleting it", async () => {
    const teammate = {
      ...createAgent("agent_channel_builder", "频道执行同事"),
      capabilityTags: ["频道", "custom"],
      provider: "opencode"
    };
    const createdConversation = {
      archivedAt: null,
      id: "conv_created_channel",
      isPinned: false,
      mode: "direct",
      ownerUserId: "user_phase_a_demo",
      participants: [{ agentId: teammate.id, agentName: teammate.name }],
      pinnedMessageIds: [],
      title: "频道执行同事频道",
      updatedAt: "2026-05-28T00:00:00.000Z",
      workspaceId: "default-workspace"
    };

    mockFetchByUrl({
      [`${apiBaseUrl}/auth/session`]: [
        jsonResponse(200, {
          authenticated: true,
          user: {
            displayName: "Phase A Demo",
            email: "phase-a-demo@example.com",
            id: "user_phase_a_demo"
          }
        })
      ],
      [`${apiBaseUrl}/conversations?workspaceId=default-workspace`]: [
        jsonResponse(200, [])
      ],
      [`${apiBaseUrl}/credentials/model-connections?workspaceId=default-workspace`]: [
        jsonResponse(200, [
          {
            id: "model_conn_demo",
            kind: "opencode_model",
            label: "OpenCode 工作区连接",
            model: "deepseek/deepseek-chat",
            preset: "balanced",
            status: "valid",
            workspaceId: "default-workspace"
          }
        ])
      ],
      [`${apiBaseUrl}/credentials?workspaceId=default-workspace`]: [
        jsonResponse(200, [createCredential("cred_opencode", "opencode", "valid")])
      ],
      [`${apiBaseUrl}/custom-agents?workspaceId=default-workspace`]: [
        jsonResponse(200, [teammate])
      ],
      [`${apiBaseUrl}/conversations`]: [
        jsonResponse(201, createdConversation)
      ],
      [`${apiBaseUrl}/messages?conversationId=conv_created_channel&workspaceId=default-workspace`]:
        [jsonResponse(200, [])],
      [`${apiBaseUrl}/coding-workflows?conversationId=conv_created_channel&workspaceId=default-workspace`]:
        [jsonResponse(200, null)],
      [`${apiBaseUrl}/conversations/conv_created_channel?workspaceId=default-workspace`]:
        [jsonResponse(200, { conversationId: "conv_created_channel", deleted: true })],
      [`${apiBaseUrl}/workspaces`]: [
        jsonResponse(200, [
          {
            createdAt: "2026-05-28T00:00:00.000Z",
            id: "default-workspace",
            name: "Phase A Demo Workspace",
            ownerUserId: "user_phase_a_demo",
            updatedAt: "2026-05-28T00:00:00.000Z"
          }
        ])
      ]
    });

    render(<ChatExperience />);

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(
          ([url]) => url === `${apiBaseUrl}/custom-agents?workspaceId=default-workspace`
        )
      ).toBe(true);
    });
    fireEvent.click(await screen.findByRole("button", { name: "打开新建对话面板" }));
    expect(await screen.findByRole("radio", { name: /频道执行同事/ })).toBeEnabled();
    fireEvent.click(screen.getByRole("radio", { name: /频道执行同事/ }));
    const createChannelButton = await screen.findByRole("button", { name: "创建对话" });
    await waitFor(() => {
      expect(createChannelButton).toBeEnabled();
    });
    fireEvent.click(createChannelButton);

    expect(
      await screen.findByRole("heading", { name: "频道执行同事频道" })
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "删除" }));

    expect(
      screen.getByText("再次确认后会删除这个会话及其消息记录。")
    ).toBeInTheDocument();
    expect(
      fetchMock.mock.calls.some(([url, options]) =>
        url === `${apiBaseUrl}/conversations/conv_created_channel?workspaceId=default-workspace` &&
        typeof options === "object" &&
        options !== null &&
        "method" in options &&
        options.method === "DELETE"
      )
    ).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "确认删除" }));

    await waitFor(() => {
      expect(
        screen.queryByRole("heading", { name: "频道执行同事频道" })
      ).not.toBeInTheDocument();
    });

    expect(fetchMock).toHaveBeenCalledWith(
      `${apiBaseUrl}/conversations/conv_created_channel?workspaceId=default-workspace`,
      expect.objectContaining({
        credentials: "include",
        method: "DELETE"
      })
    );
    expect(
      screen.getByText("还没有会话。新建单聊或群聊后，就可以让 Agent 帮你制作网页或创建 Workflow。")
    ).toBeInTheDocument();
  });

  it("shows chat, files, and pinned context in the three-column workspace", async () => {
    const conversation = {
      archivedAt: null,
      id: "conv_tabs",
      isPinned: false,
      mode: "group",
      ownerUserId: "user_phase_a_demo",
      participants: [{ agentId: "agent_tabs", agentName: "交付同事" }],
      pinnedMessageIds: ["msg_pinned"],
      title: "交付协作频道",
      updatedAt: "2026-06-06T00:19:38.000Z",
      workspaceId: "default-workspace"
    };
    const pinnedMessage = {
      content: "这是置顶结论",
      conversationId: "conv_tabs",
      createdAt: "2026-06-06T00:19:39.000Z",
      id: "msg_pinned",
      isPinned: true,
      mentionedAgentIds: [],
      ownerUserId: "user_phase_a_demo",
      role: "assistant",
      sourceAgentId: "agent_tabs",
      workspaceId: "default-workspace"
    };
    const artifactMessage = {
      content: "Markdown 交付物已生成。",
      conversationId: "conv_tabs",
      createdAt: "2026-06-06T00:19:40.000Z",
      id: "msg_artifact",
      isPinned: false,
      mentionedAgentIds: [],
      ownerUserId: "user_phase_a_demo",
      role: "assistant",
      sourceAgentId: "agent_tabs",
      workspaceId: "default-workspace"
    };

    mockFetchByUrl({
      [`${apiBaseUrl}/auth/session`]: [
        jsonResponse(200, {
          authenticated: true,
          user: {
            displayName: "Phase A Demo",
            email: "phase-a-demo@example.com",
            id: "user_phase_a_demo"
          }
        })
      ],
      [`${apiBaseUrl}/conversations?workspaceId=default-workspace`]: [
        jsonResponse(200, [conversation])
      ],
      [`${apiBaseUrl}/credentials/model-connections?workspaceId=default-workspace`]: [
        jsonResponse(200, [
          {
            id: "model_conn_demo",
            kind: "opencode_model",
            label: "OpenCode 工作区连接",
            model: "deepseek/deepseek-chat",
            preset: "balanced",
            status: "valid",
            workspaceId: "default-workspace"
          }
        ])
      ],
      [`${apiBaseUrl}/credentials?workspaceId=default-workspace`]: [
        jsonResponse(200, [createCredential("cred_opencode", "opencode", "valid")])
      ],
      [`${apiBaseUrl}/custom-agents?workspaceId=default-workspace`]: [
        jsonResponse(200, [])
      ],
      [`${apiBaseUrl}/messages?conversationId=conv_tabs&workspaceId=default-workspace`]: [
        jsonResponse(200, [pinnedMessage, artifactMessage])
      ],
      [`${apiBaseUrl}/artifacts?messageId=msg_pinned&workspaceId=default-workspace`]: [
        jsonResponse(200, [])
      ],
      [`${apiBaseUrl}/artifacts?messageId=msg_artifact&workspaceId=default-workspace`]: [
        jsonResponse(200, [
          {
            createdAt: "2026-06-06T00:19:41.000Z",
            id: "artifact_markdown",
            kind: "attachment",
            messageId: "msg_artifact",
            mimeType: "text/markdown",
            previewUrl: "https://example.test/deliverable.md",
            storageKey: "artifacts/deliverable.md",
            title: "协作交付物",
            workspaceId: "default-workspace"
          }
        ])
      ],
      [`${apiBaseUrl}/coding-workflows?conversationId=conv_tabs&workspaceId=default-workspace`]:
        [jsonResponse(200, null)],
      [`${apiBaseUrl}/workspaces`]: [
        jsonResponse(200, [
          {
            createdAt: "2026-05-28T00:00:00.000Z",
            id: "default-workspace",
            name: "Phase A Demo Workspace",
            ownerUserId: "user_phase_a_demo",
            updatedAt: "2026-05-28T00:00:00.000Z"
          }
        ])
      ]
    });

    render(<ChatExperience />);

    expect(await screen.findByText("Markdown 交付物已生成。")).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "会话文件" })).toBeInTheDocument();
    expect(screen.getAllByText("协作交付物").length).toBeGreaterThan(0);
    expect(await screen.findByRole("heading", { name: "长期上下文" })).toBeInTheDocument();
    expect(screen.getAllByText("这是置顶结论").length).toBeGreaterThan(0);
  });

  it("unpins a message and removes it from long-term context", async () => {
    const conversation = {
      archivedAt: null,
      id: "conv_unpin",
      isPinned: false,
      mode: "direct",
      ownerUserId: "user_phase_a_demo",
      participants: [{ agentId: "agent_unpin", agentName: "上下文同事" }],
      pinnedMessageIds: ["msg_unpin"],
      title: "取消置顶测试",
      updatedAt: "2026-06-06T00:19:38.000Z",
      workspaceId: "default-workspace"
    };
    const pinnedMessage = {
      content: "请长期记住这个要求",
      conversationId: "conv_unpin",
      createdAt: "2026-06-06T00:19:39.000Z",
      id: "msg_unpin",
      isPinned: true,
      mentionedAgentIds: [],
      ownerUserId: "user_phase_a_demo",
      role: "user",
      sourceAgentId: null,
      workspaceId: "default-workspace"
    };
    const unpinnedMessage = {
      ...pinnedMessage,
      isPinned: false
    };

    mockFetchByUrl({
      [`${apiBaseUrl}/auth/session`]: [
        jsonResponse(200, {
          authenticated: true,
          user: {
            displayName: "Phase A Demo",
            email: "phase-a-demo@example.com",
            id: "user_phase_a_demo"
          }
        })
      ],
      [`${apiBaseUrl}/conversations?workspaceId=default-workspace`]: [
        jsonResponse(200, [conversation])
      ],
      [`${apiBaseUrl}/credentials/model-connections?workspaceId=default-workspace`]: [
        jsonResponse(200, [])
      ],
      [`${apiBaseUrl}/credentials?workspaceId=default-workspace`]: [
        jsonResponse(200, [])
      ],
      [`${apiBaseUrl}/custom-agents?workspaceId=default-workspace`]: [
        jsonResponse(200, [])
      ],
      [`${apiBaseUrl}/messages?conversationId=conv_unpin&workspaceId=default-workspace`]: [
        jsonResponse(200, [pinnedMessage])
      ],
      [`${apiBaseUrl}/artifacts?messageId=msg_unpin&workspaceId=default-workspace`]: [
        jsonResponse(200, [])
      ],
      [`${apiBaseUrl}/messages/msg_unpin/unpin?workspaceId=default-workspace`]: [
        jsonResponse(200, {
          message: unpinnedMessage,
          pinnedMessageIds: []
        })
      ],
      [`${apiBaseUrl}/coding-workflows?conversationId=conv_unpin&workspaceId=default-workspace`]:
        [jsonResponse(200, null)],
      [`${apiBaseUrl}/workspaces`]: [
        jsonResponse(200, [
          {
            createdAt: "2026-05-28T00:00:00.000Z",
            id: "default-workspace",
            name: "Phase A Demo Workspace",
            ownerUserId: "user_phase_a_demo",
            updatedAt: "2026-05-28T00:00:00.000Z"
          }
        ])
      ]
    });

    render(<ChatExperience />);

    const pinnedHeading = await screen.findByRole("heading", { name: "长期上下文" });
    const pinnedSection = pinnedHeading.closest("section");

    expect(pinnedSection).not.toBeNull();
    expect(
      await within(pinnedSection as HTMLElement).findByText("请长期记住这个要求")
    ).toBeInTheDocument();

    fireEvent.click(await screen.findByRole("button", { name: "取消置顶" }));

    await waitFor(() => {
      expect(
        within(pinnedSection as HTMLElement).getByText("还没有置顶消息。可以在消息操作中 pin 关键要求。")
      ).toBeInTheDocument();
    });
    expect(
      within(pinnedSection as HTMLElement).queryByText("请长期记住这个要求")
    ).not.toBeInTheDocument();

    const unpinCall = fetchMock.mock.calls.find(
      ([url]) => url === `${apiBaseUrl}/messages/msg_unpin/unpin?workspaceId=default-workspace`
    );
    expect(unpinCall?.[1]).toMatchObject({
      method: "POST"
    });
  });

});

function jsonResponse(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    headers: {
      "Content-Type": "application/json"
    },
    status
  });
}

function mockFetchByUrl(responsesByUrl: Record<string, Response[]>): void {
  const counts = new Map<string, number>();

  fetchMock.mockImplementation(async (input) => {
    const url = String(input);
    const responses = responsesByUrl[url];

    if (!responses || responses.length === 0) {
      if (/^\/api\/visual-workflows\?/.test(url)) {
        return jsonResponse(200, []);
      }

      throw new Error(`Unexpected fetch call: ${url}`);
    }

    const count = counts.get(url) ?? 0;
    counts.set(url, count + 1);

    return (responses[Math.min(count, responses.length - 1)] as Response).clone();
  });
}

function createConversation(overrides: Partial<{
  archivedAt: string | null;
  id: string;
  isPinned: boolean;
  title: string;
  updatedAt: string;
}> = {}) {
  return {
    archivedAt: null,
    id: "conv_test",
    isPinned: false,
    mode: "group",
    ownerUserId: "user_demo",
    participants: [],
    pinnedMessageIds: [],
    title: "测试会话",
    updatedAt: "2026-06-01T00:00:00.000Z",
    workspaceId: "default-workspace",
    ...overrides
  };
}

function createAgent(
  id: string,
  name: string,
  overrides: Partial<{
    capabilityTags: string[];
    provider: "claude-code" | "codex" | "deepseek" | "hermes" | "mock" | "opencode" | "openclaw";
  }> = {}
) {
  return {
    avatarUrl: null,
    approvalMode: "balanced",
    capabilityTags: ["builtin-coding-team", "编码"],
    id,
    memoryMode: "workspace_plus_teammate",
    modelProfileId: null,
    name,
    ownerUserId: "user_phase_a_demo",
    provider: "deepseek",
    outputStyle: "清晰、结构化、先给结论再给步骤。",
    scopeDescription: null,
    systemPrompt: `${name} 的默认提示词。`,
    toolBindings: [],
    workspaceId: "default-workspace",
    ...overrides
  };
}

function createCredential(
  id: string,
  provider: "claude-code" | "codex" | "deepseek" | "hermes" | "opencode" | "openclaw",
  validationState: "invalid" | "pending" | "valid"
) {
  return {
    credentialSource: "user_provided",
    id,
    label: `${provider} connection`,
    ownerUserId: "user_phase_a_demo",
    provider,
    providerAccountId: provider === "opencode" ? "deepseek/deepseek-chat" : provider,
    validationState,
    workspaceId: "default-workspace"
  };
}
