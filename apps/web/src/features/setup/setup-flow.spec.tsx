// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SetupFlow } from "./setup-flow";

const fetchMock = vi.fn<typeof fetch>();

describe("SetupFlow", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it("routes the legacy setup page to the model connection flow", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse([
        {
          createdAt: "2026-05-30T00:00:00.000Z",
          id: "default-workspace",
          name: "默认工作区",
          ownerUserId: "user_demo",
          updatedAt: "2026-05-30T00:00:00.000Z"
        }
      ], 200)
    );
    fetchMock.mockResolvedValueOnce(jsonResponse([], 200));

    render(<SetupFlow />);

    expect(await screen.findByText("模型连接")).toBeInTheDocument();
    expect(screen.getByLabelText("API Key")).toBeInTheDocument();
    expect(screen.queryByText("运行策略")).not.toBeInTheDocument();
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
