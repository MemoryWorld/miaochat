// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import AgentsPage from "./page";

const fetchMock = vi.fn<typeof fetch>();

vi.mock("next/navigation", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("next/navigation");
  return {
    ...actual,
    usePathname: () => "/agents",
    useRouter: () => ({
      replace: vi.fn()
    }),
    useSearchParams: () => new URLSearchParams()
  };
});

describe("AgentsPage", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it("renders the Agent creation wizard", async () => {
    mockWorkspaceFetch();

    render(<AgentsPage />);

    expect(await screen.findByRole("heading", { name: "定义 AI 同事" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "1. 模板" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "2. 身份" })).toBeInTheDocument();
  });

  it("loads workspace agents only for duplicate-name warnings", async () => {
    mockWorkspaceFetch();

    render(<AgentsPage />);

    await screen.findByRole("heading", { name: "定义 AI 同事" });

    expect(
      fetchMock.mock.calls.filter(([url]) =>
        String(url).includes("/custom-agents?workspaceId=default-workspace")
      ).length
    ).toBeLessThanOrEqual(1);
  });
});

function mockWorkspaceFetch(): void {
  fetchMock.mockImplementation(async (input) => {
    const url = String(input);

    if (url === "/api/workspaces") {
      return jsonResponse(
        [
          {
            createdAt: "2026-05-29T00:00:00.000Z",
            id: "default-workspace",
            name: "默认工作区",
            ownerUserId: "user_demo",
            updatedAt: "2026-05-29T00:00:00.000Z"
          }
        ],
        200
      );
    }

    if (url === "/api/custom-agents?workspaceId=default-workspace") {
      return jsonResponse([], 200);
    }

    if (url === "/api/credentials?workspaceId=default-workspace") {
      return jsonResponse(
        [
          {
            credentialSource: "user_provided",
            id: "cred_opencode",
            label: "DeepSeek 连接",
            ownerUserId: "user_demo",
            provider: "opencode",
            providerAccountId: "deepseek/deepseek-chat",
            validationState: "valid",
            workspaceId: "default-workspace"
          }
        ],
        200
      );
    }

    throw new Error(`Unexpected fetch call: ${url}`);
  });
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    headers: {
      "Content-Type": "application/json"
    },
    status
  });
}
