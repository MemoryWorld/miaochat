import "@testing-library/jest-dom/vitest";

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ChatExperience } from "../../apps/web/src/features/chat/chat-experience";

const fetchMock = vi.fn<typeof fetch>();

class MockEventSource {
  static instances: MockEventSource[] = [];

  readonly close = vi.fn();
  readonly url: string;
  onerror: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent<string>) => void) | null = null;
  onopen: ((event: Event) => void) | null = null;

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }
}

describe("workspace-scoped chat shell", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("EventSource", MockEventSource);
    MockEventSource.instances = [];
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it("loads workspaces, defaults to the first one, and persists the active selection across reloads", async () => {
    fetchMock
      // initial /workspaces
      .mockResolvedValueOnce(
        jsonResponse(
          [
            {
              createdAt: "2026-05-22T00:00:00.000Z",
              id: "default-workspace",
              name: "Default Workspace",
              ownerUserId: "user_owner",
              updatedAt: "2026-05-22T00:00:00.000Z"
            },
            {
              createdAt: "2026-05-22T00:00:00.000Z",
              id: "workspace_alpha",
              name: "Alpha",
              ownerUserId: "user_owner",
              updatedAt: "2026-05-22T00:00:00.000Z"
            }
          ],
          200
        )
      )
      // initial conversations for default-workspace
      .mockResolvedValueOnce(jsonResponse([], 200))
      // conversations for workspace_alpha after switching
      .mockResolvedValueOnce(
        jsonResponse(
          [
            {
              id: "conv_alpha",
              mode: "direct",
              ownerUserId: "user_owner",
              participants: [{ agentId: "agent_alpha", agentName: "Alpha Agent" }],
              pinnedMessageIds: [],
              title: "Alpha session",
              updatedAt: new Date().toISOString(),
              workspaceId: "workspace_alpha"
            }
          ],
          200
        )
      )
      // messages load for selected conversation
      .mockResolvedValueOnce(jsonResponse([], 200));

    render(<ChatExperience />);

    await waitFor(() => {
      const select = screen.getByLabelText("Active workspace") as HTMLSelectElement;
      expect(select.options).toHaveLength(2);
    });

    expect(screen.getByLabelText("Active workspace")).toHaveValue("default-workspace");

    fireEvent.change(screen.getByLabelText("Active workspace"), {
      target: { value: "workspace_alpha" }
    });

    await waitFor(() => {
      expect(window.localStorage.getItem("agenthub.activeWorkspaceId")).toBe(
        "workspace_alpha"
      );
    });

    // Conversations request fires with the new workspaceId.
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "http://localhost:3001/conversations?workspaceId=workspace_alpha"
      );
    });

    await waitFor(() => {
      expect(screen.getAllByText("Alpha session").length).toBeGreaterThan(0);
    });
  });
});

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    status
  });
}
