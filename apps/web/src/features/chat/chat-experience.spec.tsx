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

  it("shows the login panel without an empty channel count when the workspace session is missing", async () => {
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

    expect(await screen.findByRole("button", { name: "登录" })).toBeInTheDocument();
    expect(screen.getByText("请先登录后再继续操作。")).toBeInTheDocument();
    expect(screen.queryByText("频道列表")).not.toBeInTheDocument();
    expect(screen.queryByText("0 条")).not.toBeInTheDocument();
    expect(screen.queryByText(/当前频道还没有消息/)).not.toBeInTheDocument();
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

    expect(await screen.findByRole("link", { name: "添加模型连接" })).toBeInTheDocument();
    expect(screen.getByText(/当前工作区还没有可用模型连接/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "登录" })).toBeInTheDocument();
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
    expect(screen.getByText("协作入口")).toBeInTheDocument();
    expect(screen.getByText("频道列表")).toBeInTheDocument();
    const primaryNavigation = screen.getByRole("navigation", {
      name: "Primary workspace navigation"
    });

    expect(within(primaryNavigation).getByRole("link", { name: "工作台" })).toBeInTheDocument();
    expect(within(primaryNavigation).getByRole("link", { name: "收件箱" })).toBeInTheDocument();
    expect(within(primaryNavigation).getByRole("link", { name: "频道" })).toBeInTheDocument();
    expect(within(primaryNavigation).getByRole("link", { name: "任务" })).toBeInTheDocument();
    expect(within(primaryNavigation).getByRole("link", { name: "设置" })).toBeInTheDocument();
    expect(
      within(primaryNavigation).queryByRole("link", { name: /AI 同事 角色、技能与记忆/i })
    ).not.toBeInTheDocument();
    expect(
      within(primaryNavigation).queryByRole("link", { name: /直接协作 快速进入实时协作/i })
    ).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "新建同事" })).toBeInTheDocument();
    expect(screen.queryByText("Chat Workspace")).not.toBeInTheDocument();
    expect(screen.queryByText("AgentHub")).not.toBeInTheDocument();
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
      await screen.findByRole("heading", { name: "# 当前测试频道" })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "# 旧频道" })
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
      await screen.findByRole("heading", { name: "# 当前测试频道" })
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
    expect(screen.getByRole("heading", { name: "# 当前测试频道" })).toBeInTheDocument();
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
      await screen.findByRole("heading", { name: "# 连接中频道" })
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
      content: "你们现在进入一条新的编码工作流。\n本次目标：做一个电影网页",
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

    expect(await screen.findByRole("heading", { name: "# 普通频道" })).toBeInTheDocument();
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

    expect(await screen.findByRole("heading", { name: "# 普通频道" })).toBeInTheDocument();
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

  it("opens the new-conversation flow when a phase-a credential is already bound", async () => {
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

    const newConversationButton = await screen.findByRole("button", {
      name: "新建协作"
    });

    newConversationButton.click();

    expect(
      await screen.findByText(/还没有可用的 AI 同事/i)
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/seeded mock direct conversation/i)
    ).not.toBeInTheDocument();
  });

  it("creates a channel and requires a second confirmation before deleting it", async () => {
    const teammate = {
      ...createAgent("agent_channel_builder", "频道执行同事"),
      capabilityTags: ["频道"]
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
    fireEvent.click(await screen.findByRole("button", { name: "新建协作" }));
    expect(
      await screen.findByLabelText("AI 同事", { selector: "select" }, { timeout: 3_000 })
    ).toHaveValue(teammate.id);
    const createChannelButton = await screen.findByRole("button", { name: "创建频道" });
    await waitFor(() => {
      expect(createChannelButton).toBeEnabled();
    });
    fireEvent.click(createChannelButton);

    expect(
      await screen.findByRole("heading", { name: "# 频道执行同事频道" })
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "删除 频道执行同事频道" }));

    expect(
      screen.getByText("再次确认后会删除这个频道及其消息记录。")
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

    fireEvent.click(screen.getByRole("button", { name: "确认删除 频道执行同事频道" }));

    await waitFor(() => {
      expect(
        screen.queryByRole("heading", { name: "# 频道执行同事频道" })
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
      screen.getByText("当前还没有频道。先新建一条与 AI 同事的协作，再把任务、文件和置顶内容逐步沉淀进来。")
    ).toBeInTheDocument();
  });

  it("switches the home timeline between chat, files, and pinned messages", async () => {
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

    fireEvent.click(screen.getByRole("button", { name: "文件" }));
    expect(await screen.findByRole("heading", { name: "频道文件" })).toBeInTheDocument();
    expect(screen.getByText("协作交付物")).toBeInTheDocument();
    expect(screen.queryByText("Markdown 交付物已生成。")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "置顶" }));
    expect(await screen.findByRole("heading", { name: "置顶消息" })).toBeInTheDocument();
    expect(screen.getByText("这是置顶结论")).toBeInTheDocument();
    expect(screen.queryByText("协作交付物")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "聊天" }));
    expect(await screen.findByText("Markdown 交付物已生成。")).toBeInTheDocument();
  });

  it("launches a coding workflow with the built-in team and asks the tech lead to plan first", async () => {
    const techLead = createAgent("agent_builtin_tech_lead", "技术负责人");
    const engineer = createAgent("agent_builtin_engineer", "软件工程师");
    const reviewer = createAgent("agent_builtin_reviewer", "代码评审工程师");
    const qa = createAgent("agent_builtin_qa", "质量保障测试工程师");
    const createdConversation = {
      archivedAt: null,
      id: "conv_coding_workflow",
      isPinned: false,
      mode: "group",
      ownerUserId: "user_phase_a_demo",
      participants: [
        { agentId: techLead.id, agentName: techLead.name },
        { agentId: engineer.id, agentName: engineer.name },
        { agentId: reviewer.id, agentName: reviewer.name },
        { agentId: qa.id, agentName: qa.name }
      ],
      pinnedMessageIds: [],
      title: "编码工作流 · 修复落地页演示",
      updatedAt: "2026-05-28T00:00:00.000Z",
      workspaceId: "default-workspace"
    };
    const workflow = {
      activePlanVersion: 1,
      approvalHistory: [],
      approvalState: "pending",
      conversationId: "conv_coding_workflow",
      createdAt: "2026-05-28T00:00:00.000Z",
      deadline: null,
      engineerAgentId: engineer.id,
      executionStageAssignments: [
        {
          agentId: engineer.id,
          role: "software_engineer"
        },
        {
          agentId: reviewer.id,
          role: "code_reviewer"
        },
        {
          agentId: qa.id,
          role: "qa_tester"
        }
      ],
      extraAgentIds: [],
      goal: "修复落地页演示",
      id: "workflow_coding_demo",
      kickoffMessageId: "msg_kickoff",
      ownerUserId: "user_phase_a_demo",
      planMessageId: "msg_plan",
      planningRole: "tech_lead",
      planningTeammateId: techLead.id,
      priority: "normal",
      qaAgentId: qa.id,
      repoContext: null,
      reviewerAgentId: reviewer.id,
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
      teammates: [
        {
          agentId: techLead.id,
          isBuiltIn: true,
          name: techLead.name,
          role: "tech_lead",
          runtimeBackend: "enhanced-hermes"
        },
        {
          agentId: engineer.id,
          isBuiltIn: true,
          name: engineer.name,
          role: "software_engineer",
          runtimeBackend: "enhanced-hermes"
        },
        {
          agentId: reviewer.id,
          isBuiltIn: true,
          name: reviewer.name,
          role: "code_reviewer",
          runtimeBackend: "enhanced-hermes"
        },
        {
          agentId: qa.id,
          isBuiltIn: true,
          name: qa.name,
          role: "qa_tester",
          runtimeBackend: "enhanced-hermes"
        }
      ],
      techLeadAgentId: techLead.id,
      updatedAt: "2026-05-28T00:00:00.000Z",
      workspaceId: "default-workspace"
    };
    const kickoffMessage = {
      content:
        "你们现在进入一条新的编码工作流。\n本次目标：修复落地页演示\n执行阶段预计参与成员：软件工程师、代码评审工程师、质量保障测试工程师\n请先由 技术负责人 输出计划、风险、分工和验证方案，并在获得用户确认前不要进入实现。\n其余参与成员先基于计划待命，等待用户确认后再进入执行。",
      conversationId: "conv_coding_workflow",
      createdAt: "2026-05-28T00:00:05.000Z",
      id: "msg_kickoff",
      isPinned: false,
      mentionedAgentIds: [techLead.id],
      ownerUserId: "user_phase_a_demo",
      role: "user",
      sourceAgentId: null,
      workspaceId: "default-workspace"
    };
    const planMessage = {
      content:
        "# 技术负责人 计划建议\n\n## 目标\n修复落地页演示\n\n## 执行顺序\n1. 技术负责人复述原始想法、澄清范围并固定验收边界\n2. 软件工程师按计划实现最小必要改动\n3. 代码评审工程师检查风险、行为变化和遗漏测试\n4. 质量保障测试工程师完成验证并给出验收建议\n5. 技术负责人最终汇总原始想法完成度、风险和下一步\n\n如果计划没有问题，请用户点击“批准计划”后再进入执行。",
      conversationId: "conv_coding_workflow",
      createdAt: "2026-05-28T00:00:06.000Z",
      id: "msg_plan",
      isPinned: false,
      mentionedAgentIds: [],
      ownerUserId: "user_phase_a_demo",
      role: "assistant",
      sourceAgentId: techLead.id,
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
      [`${apiBaseUrl}/coding-workflows`]: [
        jsonResponse(201, {
          conversation: createdConversation,
          workflow
        })
      ],
      [`${apiBaseUrl}/coding-workflows?conversationId=conv_coding_workflow&workspaceId=default-workspace`]:
        [jsonResponse(200, workflow)],
      [`${apiBaseUrl}/messages?conversationId=conv_coding_workflow&workspaceId=default-workspace`]:
        [jsonResponse(200, [kickoffMessage, planMessage])],
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

    const launchCodingButton = await screen.findByRole("button", { name: "启动编码工作流" });
    await waitFor(() => {
      expect(launchCodingButton).toBeEnabled();
    });
    fireEvent.click(launchCodingButton);
    fireEvent.change(screen.getByLabelText("本次目标"), {
      target: {
        value: "修复落地页演示"
      }
    });

    fireEvent.click(screen.getByRole("button", { name: "开始协作" }));

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "# 编码工作流 · 修复落地页演示" })
      ).toBeInTheDocument();
    });

    expect(await screen.findByText("计划门禁")).toBeInTheDocument();
    expect(screen.getByText("技术负责人计划")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "批准计划" })).toBeInTheDocument();

    const workflowPost = fetchMock.mock.calls.find(
      ([url, options]) =>
        url === `${apiBaseUrl}/coding-workflows` &&
        typeof options === "object" &&
        options !== null &&
        "body" in options &&
        typeof options.body === "string"
    );

    expect(workflowPost).toBeDefined();
    expect(
      JSON.parse(String(workflowPost?.[1] && "body" in workflowPost[1] ? workflowPost[1].body : "{}"))
    ).toMatchObject({
      goal: "修复落地页演示",
      priority: "normal",
      recommendedRoleIds: [
        "tech_lead",
        "software_engineer",
        "code_reviewer",
        "qa_tester"
      ],
      workspaceId: "default-workspace"
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

function createAgent(id: string, name: string) {
  return {
    avatarUrl: null,
    capabilityTags: ["builtin-coding-team", "编码"],
    id,
    name,
    ownerUserId: "user_phase_a_demo",
    provider: "deepseek",
    systemPrompt: `${name} 的默认提示词。`,
    toolBindings: [],
    workspaceId: "default-workspace"
  };
}
