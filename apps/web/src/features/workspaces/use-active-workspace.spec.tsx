import "@testing-library/jest-dom/vitest";

import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useActiveWorkspace } from "./use-active-workspace";

const fetchMock = vi.fn<typeof fetch>();

describe("useActiveWorkspace", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    fetchMock.mockReset();
    window.localStorage.clear();
  });

  it("restores a stored workspace selection once the workspace list confirms it exists", async () => {
    window.localStorage.setItem("agenthub.activeWorkspaceId", "workspace_beta");
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify([
          {
            createdAt: "2026-05-24T00:00:00.000Z",
            id: "workspace_beta",
            name: "Workspace Beta",
            ownerUserId: "user_beta",
            updatedAt: "2026-05-24T00:00:00.000Z"
          }
        ]),
        {
          headers: {
            "Content-Type": "application/json"
          },
          status: 200
        }
      )
    );

    const { result } = renderHook(() => useActiveWorkspace());

    await waitFor(() => {
      expect(result.current.activeWorkspaceId).toBe("workspace_beta");
    });
  });
});
