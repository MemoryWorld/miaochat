// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ModelConnectionsPanel } from "./model-connections-panel";

const fetchMock = vi.fn<typeof fetch>();

describe("ModelConnectionsPanel", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it("explains disabled states for missing fields and unvalidated connections", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse([], 200));

    render(<ModelConnectionsPanel workspaceId="workspace_1" />);

    expect(await screen.findByText("当前工作区还没有模型连接。")).toBeInTheDocument();
    expect(screen.getByText("选择来源，填写模型标识和 API Key，验证后保存。")).toBeInTheDocument();
    expect(screen.queryByText("国产模型")).not.toBeInTheDocument();
    expect(screen.queryByText(/默认使用 OpenCode 的/)).not.toBeInTheDocument();
    expect(screen.getByLabelText("连接名称")).toHaveValue("DeepSeek 连接");
    expect(screen.getByText("请填写 API Key。")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("连接名称"), {
      target: { value: "" }
    });
    expect(screen.getByText("请填写连接名称。")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("连接名称"), {
      target: { value: "DeepSeek 连接" }
    });
    fireEvent.change(screen.getByLabelText("API Key"), {
      target: { value: "sk-demo" }
    });
    expect(screen.getByText("请先验证连接，再保存启用。")).toBeInTheDocument();
  });

  it("surfaces product-safe validation failures", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse([], 200))
      .mockResolvedValueOnce(jsonResponse({ message: "模型服务暂时不可用。", valid: false }, 500));

    render(<ModelConnectionsPanel workspaceId="workspace_1" />);

    await screen.findByText("当前工作区还没有模型连接。");
    fireEvent.change(screen.getByLabelText("API Key"), {
      target: { value: "sk-demo" }
    });
    fireEvent.click(screen.getByRole("button", { name: "验证连接" }));

    expect(await screen.findByText("模型服务暂时不可用。")).toBeInTheDocument();
  });

  it("validates, saves, and reloads the selected preset", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse([], 200))
      .mockResolvedValueOnce(jsonResponse({ message: "模型连接可用。", valid: true }, 200))
      .mockResolvedValueOnce(jsonResponse(savedCredential(), 201))
      .mockResolvedValueOnce(jsonResponse([savedCredential()], 200));

    render(<ModelConnectionsPanel workspaceId="workspace_1" />);

    await screen.findByText("当前工作区还没有模型连接。");
    fireEvent.change(screen.getByLabelText("API Key"), {
      target: { value: "sk-demo" }
    });
    fireEvent.click(screen.getByRole("button", { name: "验证连接" }));

    expect(await screen.findByText("模型连接可用。")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "保存并启用" }));

    await waitFor(() => {
      expect(screen.getByText("DeepSeek 连接")).toBeInTheDocument();
    });
    expect(screen.queryByText("已保存连接")).not.toBeInTheDocument();
    const savedConnectionCard = screen
      .getByText("DeepSeek 连接")
      .closest("article");
    expect(savedConnectionCard).not.toBeNull();
    expect(savedConnectionCard).not.toHaveTextContent("DeepSeek可用");
    expect(savedConnectionCard).toHaveTextContent("模型：deepseek/deepseek-chat");
    expect(savedConnectionCard).not.toHaveTextContent(
      "通过 OpenCode 接入 DeepSeek，不再走旧 DeepSeek 直连接口。"
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/credentials/validate",
      expect.objectContaining({
        credentials: "include",
        method: "POST"
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "/api/credentials",
      expect.objectContaining({
        credentials: "include",
        method: "POST"
      })
    );
    const saveCall = fetchMock.mock.calls[2];
    const saveBody = JSON.parse(String(saveCall?.[1] && "body" in saveCall[1] ? saveCall[1].body : "{}"));
    expect(saveBody).toMatchObject({
      label: "DeepSeek 连接",
      provider: "opencode",
      providerAccountId: "deepseek/deepseek-chat",
      rawSecret: "sk-demo",
      workspaceId: "workspace_1"
    });
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/credentials?workspaceId=workspace_1",
      { credentials: "include" }
    );
  });

  it("hides legacy OpenCode suffixes from saved domestic connection names", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse([
      savedCredential({
        label: "DeepSeek（OpenCode）连接"
      })
    ], 200));

    render(<ModelConnectionsPanel workspaceId="workspace_1" />);

    expect(await screen.findByText("DeepSeek 连接")).toBeInTheDocument();
    expect(screen.queryByText("DeepSeek（OpenCode）连接")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "删除 DeepSeek 连接" })).toBeInTheDocument();
  });

  it("lets users delete an existing model connection after confirmation", async () => {
    const confirmMock = vi.fn(() => true);
    vi.stubGlobal("confirm", confirmMock);

    fetchMock
      .mockResolvedValueOnce(
        jsonResponse([
          {
            ...savedCredential(),
            id: "conn_old",
            label: "DeepSeek 旧连接"
          },
          {
            ...savedCredential(),
            id: "conn_active",
            label: "DeepSeek 当前连接"
          }
        ], 200)
      )
      .mockResolvedValueOnce(jsonResponse({ deleted: true, id: "conn_old", workspaceId: "workspace_1" }, 200))
      .mockResolvedValueOnce(
        jsonResponse([
          {
            ...savedCredential(),
            id: "conn_active",
            label: "DeepSeek 当前连接"
          }
        ], 200)
      );

    render(<ModelConnectionsPanel workspaceId="workspace_1" />);

    expect(await screen.findByText("DeepSeek 旧连接")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "删除 DeepSeek 旧连接" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/credentials/conn_old?workspaceId=workspace_1", {
        credentials: "include",
        method: "DELETE"
      });
    });
    expect(confirmMock).toHaveBeenCalledWith(
      "确定删除这个模型连接吗？删除后，使用该连接的 AI 同事需要重新选择可用连接。"
    );
    await waitFor(() => {
      expect(screen.queryByText("DeepSeek 旧连接")).not.toBeInTheDocument();
    });
    expect(screen.getByText("DeepSeek 当前连接")).toBeInTheDocument();
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

function savedCredential(overrides: Record<string, unknown> = {}) {
  const provider = typeof overrides.provider === "string" ? overrides.provider : "opencode";

  return {
    credentialSource: "user_provided",
    id: "conn_1",
    label: provider === "opencode" ? "DeepSeek 连接" : "DeepSeek 工作区连接",
    ownerUserId: "user_demo",
    provider,
    providerAccountId: provider === "opencode" ? "deepseek/deepseek-chat" : "deepseek-chat",
    validationState: "valid",
    workspaceId: "workspace_1",
    ...overrides
  };
}
