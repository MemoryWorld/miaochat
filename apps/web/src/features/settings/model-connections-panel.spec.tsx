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
    expect(screen.getByText("请填写 API Key。")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("连接名称"), {
      target: { value: "" }
    });
    expect(screen.getByText("请填写连接名称。")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("连接名称"), {
      target: { value: "DeepSeek 工作区连接" }
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
      .mockResolvedValueOnce(
        jsonResponse({
          id: "conn_1",
          kind: "deepseek_api",
          label: "DeepSeek 工作区连接",
          model: "deepseek-chat",
          preset: "powerful",
          status: "valid",
          workspaceId: "workspace_1"
        }, 201)
      )
      .mockResolvedValueOnce(
        jsonResponse([
          {
            id: "conn_1",
            kind: "deepseek_api",
            label: "DeepSeek 工作区连接",
            model: "deepseek-chat",
            preset: "powerful",
            status: "valid",
            workspaceId: "workspace_1"
          }
        ], 200)
      );

    render(<ModelConnectionsPanel workspaceId="workspace_1" />);

    await screen.findByText("当前工作区还没有模型连接。");
    fireEvent.change(screen.getByLabelText("API Key"), {
      target: { value: "sk-demo" }
    });
    fireEvent.change(screen.getByLabelText("默认偏好"), {
      target: { value: "powerful" }
    });
    fireEvent.click(screen.getByRole("button", { name: "验证连接" }));

    expect(await screen.findByText("模型连接可用。")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "保存并启用" }));

    await waitFor(() => {
      expect(screen.getAllByText("高性能").length).toBeGreaterThan(0);
    });
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/credentials/model-connections?workspaceId=workspace_1",
      { credentials: "include" }
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
