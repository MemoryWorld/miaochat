import "@testing-library/jest-dom/vitest";

import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
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

  it("keeps the active workspace when a later workspace refresh gets an auth-shaped error but the session is still authenticated", async () => {
    let workspaceFetchCount = 0;

    fetchMock.mockImplementation(async (input) => {
      const url = String(input);

      if (url.endsWith("/auth/session")) {
        return new Response(
          JSON.stringify({
            authenticated: true,
            user: {
              displayName: "Phase A Demo",
              email: "phase-a-demo@example.com",
              id: "user_phase_a_demo"
            }
          }),
          {
            headers: {
              "Content-Type": "application/json"
            },
            status: 200
          }
        );
      }

      if (url.endsWith("/workspaces")) {
        workspaceFetchCount += 1;

        if (workspaceFetchCount === 1) {
          return new Response(
            JSON.stringify([
              {
                createdAt: "2026-05-24T00:00:00.000Z",
                id: "default-workspace",
                name: "Default Workspace",
                ownerUserId: "user_demo",
                updatedAt: "2026-05-24T00:00:00.000Z"
              }
            ]),
            {
              headers: {
                "Content-Type": "application/json"
              },
              status: 200
            }
          );
        }

        return new Response(JSON.stringify({ message: "Unauthorized" }), {
          headers: {
            "Content-Type": "application/json"
          },
          status: 401
        });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    const { result } = renderHook(() => useActiveWorkspace());

    await waitFor(() => {
      expect(result.current.workspaces).toHaveLength(1);
    });

    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.requiresLogin).toBe(false);
    expect(result.current.activeWorkspaceId).toBe("default-workspace");
    expect(result.current.workspaces).toHaveLength(1);
    expect(result.current.error).toBe("工作区刷新失败。");
  });

  it("keeps the active workspace when a later auth-shaped refresh cannot confirm the session", async () => {
    let workspaceFetchCount = 0;

    fetchMock.mockImplementation(async (input) => {
      const url = String(input);

      if (url.endsWith("/auth/session")) {
        return new Response(
          JSON.stringify({
            authenticated: false
          }),
          {
            headers: {
              "Content-Type": "application/json"
            },
            status: 200
          }
        );
      }

      if (url.endsWith("/workspaces")) {
        workspaceFetchCount += 1;

        if (workspaceFetchCount === 1) {
          return new Response(
            JSON.stringify([
              {
                createdAt: "2026-05-24T00:00:00.000Z",
                id: "default-workspace",
                name: "Default Workspace",
                ownerUserId: "user_demo",
                updatedAt: "2026-05-24T00:00:00.000Z"
              }
            ]),
            {
              headers: {
                "Content-Type": "application/json"
              },
              status: 200
            }
          );
        }

        return new Response(JSON.stringify({ message: "Unauthorized" }), {
          headers: {
            "Content-Type": "application/json"
          },
          status: 401
        });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    const { result } = renderHook(() => useActiveWorkspace());

    await waitFor(() => {
      expect(result.current.workspaces).toHaveLength(1);
    });

    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.requiresLogin).toBe(false);
    expect(result.current.activeWorkspaceId).toBe("default-workspace");
    expect(result.current.workspaces).toHaveLength(1);
    expect(result.current.error).toBe("工作区刷新失败。");
  });

  it("clears the workspace when auth fails during an explicit logout refresh", async () => {
    let workspaceFetchCount = 0;

    fetchMock.mockImplementation(async (input) => {
      const url = String(input);

      if (url.endsWith("/auth/session")) {
        return new Response(
          JSON.stringify({
            authenticated: false
          }),
          {
            headers: {
              "Content-Type": "application/json"
            },
            status: 200
          }
        );
      }

      if (url.endsWith("/workspaces")) {
        workspaceFetchCount += 1;

        if (workspaceFetchCount === 1) {
          return new Response(
            JSON.stringify([
              {
                createdAt: "2026-05-24T00:00:00.000Z",
                id: "default-workspace",
                name: "Default Workspace",
                ownerUserId: "user_demo",
                updatedAt: "2026-05-24T00:00:00.000Z"
              }
            ]),
            {
              headers: {
                "Content-Type": "application/json"
              },
              status: 200
            }
          );
        }

        return new Response(JSON.stringify({ message: "Unauthorized" }), {
          headers: {
            "Content-Type": "application/json"
          },
          status: 401
        });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    const { result } = renderHook(() => useActiveWorkspace());

    await waitFor(() => {
      expect(result.current.workspaces).toHaveLength(1);
    });

    await act(async () => {
      await result.current.refresh({ clearOnAuthFailure: true });
    });

    expect(result.current.requiresLogin).toBe(true);
    expect(result.current.workspaces).toHaveLength(0);
  });
});
