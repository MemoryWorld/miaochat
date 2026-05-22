import "@testing-library/jest-dom/vitest";

import {
  cleanup,
  render,
  screen,
  waitFor
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AccessReviewPanel } from "../../apps/web/src/features/chat/access-review-panel";

const fetchMock = vi.fn<typeof fetch>();

describe("shared conversation audit", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it("renders the conversation access timeline of share/role/read events", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        [
          {
            action: "conversation.share",
            actorUserId: "user_owner",
            createdAt: "2026-05-22T09:00:00.000Z",
            details: { sharedWith: ["user_alice"] },
            id: "evt_share",
            resourceId: "conv_1",
            resourceType: "conversation"
          },
          {
            action: "role.change",
            actorUserId: "user_owner",
            createdAt: "2026-05-22T09:01:00.000Z",
            details: {
              conversationId: "conv_1",
              nextRole: "admin",
              previousRole: "member"
            },
            id: "evt_role",
            resourceId: "user_alice",
            resourceType: "workspace_member"
          }
        ],
        200
      )
    );

    render(<AccessReviewPanel conversationId="conv_1" />);

    await waitFor(() => {
      expect(screen.getByText("conversation.share")).toBeInTheDocument();
    });
    expect(screen.getByText("role.change")).toBeInTheDocument();

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3001/conversations/conv_1/access-review",
      expect.objectContaining({ credentials: "include" })
    );
  });
});

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    status
  });
}
