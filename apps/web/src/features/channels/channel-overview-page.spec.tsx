// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ChannelOverviewPage } from "./channel-overview-page";

const fetchMock = vi.fn<typeof fetch>();
const apiBaseUrl = "/api";

vi.mock("next/navigation", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("next/navigation");
  return {
    ...actual,
    usePathname: () => "/channels/overview"
  };
});

describe("ChannelOverviewPage", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it("shows the login panel instead of an empty channel state when the session is missing", async () => {
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

    render(<ChannelOverviewPage />);

    expect(await screen.findByRole("button", { name: "登录" })).toBeInTheDocument();
    expect(screen.getByText("请先登录后再继续操作。")).toBeInTheDocument();
    expect(screen.queryByText("当前还没有频道。你可以先从首页启动网页制作协作或创建新的协作会话。")).not.toBeInTheDocument();
  });

  it("does not show a login prompt when only the channel list refresh has an auth-shaped error", async () => {
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
        jsonResponse(401, {
          message: "Unauthorized"
        })
      ]
    });

    render(<ChannelOverviewPage />);

    expect(await screen.findByText("Unauthorized")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "登录" })).not.toBeInTheDocument();
    expect(screen.queryByText("请先登录后再继续操作。")).not.toBeInTheDocument();
    expect(screen.queryByText("当前还没有频道。你可以先从首页启动网页制作协作或创建新的协作会话。")).not.toBeInTheDocument();
  });
});

function mockFetchByUrl(routes: Record<string, Response[]>): void {
  fetchMock.mockImplementation(async (input) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const queue = routes[url];
    const response = queue?.shift();

    if (!response) {
      throw new Error(`Unexpected fetch: ${url}`);
    }

    return response;
  });
}

function jsonResponse(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    headers: {
      "content-type": "application/json"
    },
    status
  });
}
