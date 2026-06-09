// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TeammateCreateWizard } from "./teammate-create-wizard";

const fetchMock = vi.fn<typeof fetch>();
const routerReplaceMock = vi.fn();
let searchParams = new URLSearchParams();

vi.mock("next/navigation", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("next/navigation");
  return {
    ...actual,
    usePathname: () => "/teammates/new",
    useRouter: () => ({
      replace: routerReplaceMock
    }),
    useSearchParams: () => searchParams
  };
});

describe("TeammateCreateWizard", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    routerReplaceMock.mockReset();
    searchParams = new URLSearchParams();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it("posts a structured teammate definition after walking through the wizard", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse([
          {
            createdAt: "2026-05-29T00:00:00.000Z",
            id: "default-workspace",
            name: "默认工作区",
            ownerUserId: "user_demo",
            updatedAt: "2026-05-29T00:00:00.000Z"
          }
        ], 200)
      )
      .mockResolvedValueOnce(jsonResponse([validCredential()], 200))
      .mockResolvedValueOnce(jsonResponse({ id: "agent_new" }, 201));

    render(<TeammateCreateWizard />);

    fireEvent.click(await screen.findByRole("button", { name: "2. 身份" }));
    fireEvent.change(screen.getByLabelText("AI 同事名称"), {
      target: { value: "交付协同助手" }
    });
    fireEvent.change(screen.getByLabelText("角色职责说明"), {
      target: { value: "整理交付上下文、梳理说明并补充行动项。" }
    });

    fireEvent.click(screen.getByRole("button", { name: "3. 范围" }));
    fireEvent.change(screen.getByLabelText("工作区或频道范围"), {
      target: { value: "默认加入 ship 和 release 两个频道。" }
    });

    fireEvent.click(screen.getByRole("button", { name: "4. 能力" }));
    fireEvent.change(screen.getByLabelText("能力与标签"), {
      target: { value: "交付, 文档, 跟进" }
    });

    fireEvent.click(screen.getByRole("button", { name: "5. 高级" }));
    fireEvent.change(screen.getByLabelText("模型偏好"), {
      target: { value: "fast" }
    });
    expect(screen.getByText("协作护栏")).toBeInTheDocument();
    expect(screen.getByText("任务边界")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "6. 确认" }));
    fireEvent.click(screen.getByRole("button", { name: "创建 AI 同事" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenNthCalledWith(
        2,
        "/api/credentials?workspaceId=default-workspace",
        expect.objectContaining({
          credentials: "include"
        })
      );
      expect(fetchMock).toHaveBeenNthCalledWith(
        3,
        "/api/custom-agents",
        expect.objectContaining({
          credentials: "include",
          method: "POST"
        })
      );
    });

    const postCall = fetchMock.mock.calls[2];
    expect(postCall).toBeDefined();
    const requestBody = JSON.parse(String(postCall?.[1] && "body" in postCall[1] ? postCall[1].body : "{}"));

    expect(requestBody).toMatchObject({
      name: "交付协同助手",
      provider: "opencode",
      modelProfileId: "fast",
      workspaceId: "default-workspace"
    });
    expect(String(requestBody.systemPrompt)).toContain("默认工作模式：编码");
    expect(String(requestBody.systemPrompt)).toContain("默认加入 ship 和 release 两个频道");
    expect(String(requestBody.systemPrompt)).toContain("协作护栏：任务边界");
    expect(requestBody.capabilityTags).toEqual(
      expect.arrayContaining(["任务边界", "上下文资料包", "过程记录"])
    );
  });

  it("prefills fields from the custom template without exposing runtime choices", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse([
          {
            createdAt: "2026-05-29T00:00:00.000Z",
            id: "default-workspace",
            name: "默认工作区",
            ownerUserId: "user_demo",
            updatedAt: "2026-05-29T00:00:00.000Z"
          }
        ], 200)
      )
      .mockResolvedValueOnce(jsonResponse([validCredential()], 200));

    render(<TeammateCreateWizard />);

    fireEvent.click(await screen.findByRole("button", { name: /自定义同事/ }));
    fireEvent.click(screen.getByRole("button", { name: "2. 身份" }));

    expect(screen.getByLabelText("AI 同事名称")).toHaveValue("自定义同事");
    expect(screen.queryByText("运行策略")).not.toBeInTheDocument();
  });

  it("allows OpenCode-backed teammates to reuse a legacy DeepSeek credential", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse([
          {
            createdAt: "2026-05-29T00:00:00.000Z",
            id: "default-workspace",
            name: "默认工作区",
            ownerUserId: "user_demo",
            updatedAt: "2026-05-29T00:00:00.000Z"
          }
        ], 200)
      )
      .mockResolvedValueOnce(
        jsonResponse([
          validCredential({
            id: "cred_legacy_deepseek",
            label: "DeepSeek 旧连接",
            provider: "deepseek",
            providerAccountId: "deepseek-chat"
          })
        ], 200)
      );

    render(<TeammateCreateWizard />);

    fireEvent.click(await screen.findByRole("button", { name: "6. 确认" }));

    expect(
      screen.queryByText("请先在设置中添加可用的 国产模型 / OpenCode 模型连接。")
    ).not.toBeInTheDocument();
    expect(screen.getByText("运行 Provider")).toBeInTheDocument();
    expect(screen.getByText("国产模型 / OpenCode")).toBeInTheDocument();
  });

  it("creates and adds the teammate to the current channel when launched from a channel", async () => {
    searchParams = new URLSearchParams({
      channelId: "conv_phase_d",
      returnTo: "/channels/conv_phase_d?tab=chat"
    });
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse([
          {
            createdAt: "2026-05-29T00:00:00.000Z",
            id: "default-workspace",
            name: "默认工作区",
            ownerUserId: "user_demo",
            updatedAt: "2026-05-29T00:00:00.000Z"
          }
        ], 200)
      )
      .mockResolvedValueOnce(
        jsonResponse([
          {
            archivedAt: null,
            id: "conv_phase_d",
            isPinned: false,
            mode: "group",
            ownerUserId: "user_demo",
            participants: [
              { agentId: "agent_existing", agentName: "技术负责人" }
            ],
            pinnedMessageIds: [],
            title: "Phase D 编码频道",
            updatedAt: "2026-05-29T00:00:00.000Z",
            workspaceId: "default-workspace"
          }
        ], 200)
      )
      .mockResolvedValueOnce(jsonResponse([validCredential()], 200))
      .mockResolvedValueOnce(
        jsonResponse({
          agent: {
            id: "agent_channel_new",
            name: "频道测试同事"
          },
          conversation: {
            id: "conv_phase_d",
            participants: [
              { agentId: "agent_existing", agentName: "技术负责人" },
              { agentId: "agent_channel_new", agentName: "频道测试同事" }
            ]
          }
        }, 201)
      );

    render(<TeammateCreateWizard />);

    fireEvent.click(await screen.findByRole("button", { name: "2. 身份" }));
    fireEvent.change(screen.getByLabelText("AI 同事名称"), {
      target: { value: "频道测试同事" }
    });
    fireEvent.change(screen.getByLabelText("角色职责说明"), {
      target: { value: "补充频道中的测试和验收工作。" }
    });
    fireEvent.click(screen.getByRole("button", { name: "6. 确认" }));
    fireEvent.click(screen.getByRole("button", { name: "创建 AI 同事并加入频道" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenNthCalledWith(
        4,
        "/api/conversations/conv_phase_d/teammates",
        expect.objectContaining({
          credentials: "include",
          method: "POST"
        })
      );
    });

    const postCall = fetchMock.mock.calls[3];
    expect(postCall).toBeDefined();
    const requestBody = JSON.parse(String(postCall?.[1] && "body" in postCall[1] ? postCall[1].body : "{}"));

    expect(requestBody).toMatchObject({
      workspaceId: "default-workspace",
      teammate: {
        name: "频道测试同事",
        modelProfileId: "balanced"
      }
    });
    expect(requestBody.teammate.provider).toBe("opencode");
    expect(routerReplaceMock).toHaveBeenCalledWith("/channels/conv_phase_d?tab=chat");
  });

  it("falls back to the current channel when returnTo is not an internal path", async () => {
    searchParams = new URLSearchParams({
      channelId: "conv_phase_d",
      returnTo: "//example.com/steal"
    });
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse([
          {
            createdAt: "2026-05-29T00:00:00.000Z",
            id: "default-workspace",
            name: "默认工作区",
            ownerUserId: "user_demo",
            updatedAt: "2026-05-29T00:00:00.000Z"
          }
        ], 200)
      )
      .mockResolvedValueOnce(
        jsonResponse([
          {
            archivedAt: null,
            id: "conv_phase_d",
            isPinned: false,
            mode: "group",
            ownerUserId: "user_demo",
            participants: [
              { agentId: "agent_existing", agentName: "技术负责人" }
            ],
            pinnedMessageIds: [],
            title: "Phase D 编码频道",
            updatedAt: "2026-05-29T00:00:00.000Z",
            workspaceId: "default-workspace"
          }
        ], 200)
      )
      .mockResolvedValueOnce(jsonResponse([validCredential()], 200))
      .mockResolvedValueOnce(jsonResponse({ agent: { id: "agent_channel_new" } }, 201));

    render(<TeammateCreateWizard />);

    fireEvent.click(await screen.findByRole("button", { name: "6. 确认" }));
    fireEvent.click(screen.getByRole("button", { name: "创建 AI 同事并加入频道" }));

    await waitFor(() => {
      expect(routerReplaceMock).toHaveBeenCalledWith("/channels/conv_phase_d?tab=chat");
    });
  });

  it("warns in Chinese when the requested name already exists in the current channel", async () => {
    searchParams = new URLSearchParams({
      channelId: "conv_phase_d",
      returnTo: "/channels/conv_phase_d?tab=chat"
    });
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse([
          {
            createdAt: "2026-05-29T00:00:00.000Z",
            id: "default-workspace",
            name: "默认工作区",
            ownerUserId: "user_demo",
            updatedAt: "2026-05-29T00:00:00.000Z"
          }
        ], 200)
      )
      .mockResolvedValueOnce(
        jsonResponse([
          {
            archivedAt: null,
            id: "conv_phase_d",
            isPinned: false,
            mode: "group",
            ownerUserId: "user_demo",
            participants: [
              { agentId: "agent_existing_engineer", agentName: "软件工程师" },
              { agentId: "agent_existing_reviewer", agentName: "代码评审工程师" }
            ],
            pinnedMessageIds: [],
            title: "Phase D 编码频道",
            updatedAt: "2026-05-29T00:00:00.000Z",
            workspaceId: "default-workspace"
          }
        ], 200)
      )
      .mockResolvedValueOnce(jsonResponse([validCredential()], 200));

    render(<TeammateCreateWizard />);

    fireEvent.click(await screen.findByRole("button", { name: "2. 身份" }));
    fireEvent.change(screen.getByLabelText("AI 同事名称"), {
      target: { value: "软件工程师" }
    });

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "当前频道已存在名为“软件工程师”的 AI 同事，保存时将自动命名为“软件工程师1”。"
    );
  });
});

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    headers: {
      "Content-Type": "application/json"
    },
    status
  });
}

function validCredential(overrides: Record<string, unknown> = {}) {
  const provider = typeof overrides.provider === "string" ? overrides.provider : "opencode";

  return {
    credentialSource: "user_provided",
    id: "cred_opencode",
    label: provider === "opencode" ? "DeepSeek（OpenCode）连接" : "DeepSeek 工作区连接",
    ownerUserId: "user_demo",
    provider,
    providerAccountId: provider === "opencode" ? "deepseek/deepseek-chat" : "deepseek-chat",
    validationState: "valid",
    workspaceId: "default-workspace",
    ...overrides
  };
}
