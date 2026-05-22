import "@testing-library/jest-dom/vitest";

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ConversationList } from "../../apps/web/src/features/chat/conversation-list";

const fetchMock = vi.fn<typeof fetch>();

describe("conversation list features", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it("loads conversations, pins one, and includes the pinned indicator after refresh", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse([baseConversation()], 200))
      .mockResolvedValueOnce(jsonResponse({ id: "conv_1", isPinned: true }, 200))
      .mockResolvedValueOnce(
        jsonResponse(
          [
            {
              ...baseConversation(),
              isPinned: true
            }
          ],
          200
        )
      );

    render(
      <ConversationList workspaceId="default-workspace" onSelect={() => undefined} />
    );

    await waitFor(() => {
      expect(screen.getByText("Release planning")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Pin" }));

    await waitFor(() => {
      expect(screen.getByText(/📌/)).toBeInTheDocument();
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "http://localhost:3001/conversations/conv_1/pin?workspaceId=default-workspace",
      expect.objectContaining({ method: "POST" })
    );
  });
});

function baseConversation() {
  return {
    archivedAt: null,
    id: "conv_1",
    isPinned: false,
    mode: "direct",
    ownerUserId: "user_owner",
    participants: [{ agentId: "agent_a", agentName: "Agent A" }],
    pinnedMessageIds: [],
    title: "Release planning",
    updatedAt: new Date().toISOString(),
    workspaceId: "default-workspace"
  };
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    status
  });
}
