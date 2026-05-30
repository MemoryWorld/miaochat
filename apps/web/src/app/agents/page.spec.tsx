// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import type * as NextNavigationModule from "next/navigation";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import AgentsPage from "./page";

const fetchMock = vi.fn<typeof fetch>();

vi.mock("next/navigation", async () => {
  const actual = await vi.importActual<NextNavigationModule>("next/navigation");
  return {
    ...actual,
    usePathname: () => "/teammates"
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

  it("renders the lightweight teammate entry and points users to the creation wizard", async () => {
    mockWorkspaceFetch();

    render(<AgentsPage />);

    expect(await screen.findByRole("heading", { name: "创建同事" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "新建同事" })).toHaveAttribute(
      "href",
      "/teammates/new"
    );
  });

  it("does not request the old custom-agent directory data", async () => {
    mockWorkspaceFetch();

    render(<AgentsPage />);

    await screen.findByRole("heading", { name: "创建同事" });

    expect(
      fetchMock.mock.calls.some(([url]) =>
        String(url).includes("/custom-agents?workspaceId=default-workspace")
      )
    ).toBe(false);
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
