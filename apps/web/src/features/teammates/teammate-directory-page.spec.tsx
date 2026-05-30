// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import type * as NextNavigationModule from "next/navigation";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TeammateDirectoryPage } from "./teammate-directory-page";

const fetchMock = vi.fn<typeof fetch>();
const apiBaseUrl = "http://localhost:3001";

vi.mock("next/navigation", async () => {
  const actual = await vi.importActual<NextNavigationModule>("next/navigation");
  return {
    ...actual,
    usePathname: () => "/teammates"
  };
});

describe("TeammateDirectoryPage", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it("renders the teammates route as a lightweight creation entry instead of a management directory", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse([
        {
          createdAt: "2026-05-29T00:00:00.000Z",
          id: "default-workspace",
          name: "默认工作区",
          ownerUserId: "user_demo",
          updatedAt: "2026-05-29T00:00:00.000Z"
        }
      ], 200)
    );

    render(<TeammateDirectoryPage />);

    expect(await screen.findByRole("link", { name: "新建同事" })).toBeInTheDocument();
    expect(screen.getByText("创建同事")).toBeInTheDocument();
    expect(screen.getByText(/创建完成后，后续管理和协作会回到频道里继续推进/i)).toBeInTheDocument();
    expect(screen.queryByText("默认编码团队")).not.toBeInTheDocument();
    expect(screen.queryByText("自定义 AI 同事")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "查看成员设置" })).not.toBeInTheDocument();

    expect(fetchMock).toHaveBeenCalledWith(`${apiBaseUrl}/workspaces`, {
      credentials: "include"
    });
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
