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
import type * as NextNavigationModule from "next/navigation";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ChatExperience } from "./chat-experience";

const fetchMock = vi.fn<typeof fetch>();
const apiBaseUrl = "/api";

vi.mock("next/navigation", async () => {
  const actual = await vi.importActual<NextNavigationModule>("next/navigation");
  return {
    ...actual,
    usePathname: () => "/channels/overview"
  };
});

class MockEventSource {
  readonly close = vi.fn();
  onerror: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent<string>) => void) | null = null;
  onopen: ((event: Event) => void) | null = null;

  constructor() {}
}

describe("ChatExperience", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("EventSource", MockEventSource);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    fetchMock.mockReset();
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

    fireEvent.click(await screen.findByRole("button", { name: "新建协作" }));
    await waitFor(() => {
      expect(screen.getByLabelText("AI 同事")).toHaveValue(teammate.id);
    });
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

  it("launches a coding workflow with the built-in team and asks the tech lead to plan first", async () => {
    const techLead = createAgent("agent_builtin_tech_lead", "技术负责人");
    const engineer = createAgent("agent_builtin_engineer", "软件工程师");
    const reviewer = createAgent("agent_builtin_reviewer", "代码评审");
    const qa = createAgent("agent_builtin_qa", "测试工程师");
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
          id: "execution:qa_tester",
          ownerRole: "qa_tester",
          state: "todo",
          title: "测试工程师完成验证"
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
        "你们现在进入一条新的编码工作流。\n本次目标：修复落地页演示\n执行阶段预计参与成员：软件工程师、测试工程师\n请先由 技术负责人 输出计划、风险、分工和验证方案，并在获得用户确认前不要进入实现。\n其余参与成员先基于计划待命，等待用户确认后再进入执行。",
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
        "# 技术负责人 计划建议\n\n## 目标\n修复落地页演示\n\n## 执行顺序\n1. 技术负责人澄清范围并固定验收边界\n2. 软件工程师按计划实现最小必要改动\n3. 测试工程师完成验证并给出验收建议\n\n如果计划没有问题，请用户点击“批准计划”后再进入执行。",
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

    fireEvent.click(screen.getByRole("button", { name: "删除代码评审" }));
    fireEvent.click(screen.getByRole("button", { name: "确认删除" }));
    fireEvent.click(await screen.findByRole("button", { name: "启动编码工作流" }));
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
      recommendedRoleIds: ["tech_lead", "software_engineer", "qa_tester"],
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
