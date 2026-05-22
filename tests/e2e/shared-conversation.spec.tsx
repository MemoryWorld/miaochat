import "@testing-library/jest-dom/vitest";

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ShareConversationDialog } from "../../apps/web/src/features/chat/share-conversation-dialog";

const fetchMock = vi.fn<typeof fetch>();

describe("shared conversation flow", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it("posts user ids to the shares endpoint and reflects the new share entry", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse([], 200))
      .mockResolvedValueOnce(
        jsonResponse(
          [
            {
              conversationId: "conv_1",
              createdAt: "2026-05-22T00:00:00.000Z",
              createdByUserId: "user_owner",
              permission: "read",
              sharedWithUserId: "user_invited",
              workspaceId: "default-workspace",
              workspaceOwnerUserId: "user_owner"
            }
          ],
          201
        )
      )
      .mockResolvedValueOnce(
        jsonResponse(
          [
            {
              conversationId: "conv_1",
              createdAt: "2026-05-22T00:00:00.000Z",
              createdByUserId: "user_owner",
              permission: "read",
              sharedWithUserId: "user_invited",
              workspaceId: "default-workspace",
              workspaceOwnerUserId: "user_owner"
            }
          ],
          200
        )
      );

    render(<ShareConversationDialog conversationId="conv_1" onClose={() => undefined} />);

    fireEvent.change(screen.getByLabelText("Share user ids"), {
      target: { value: "user_invited" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Share" }));

    await waitFor(() => {
      expect(screen.getByText(/user_invited — read/)).toBeInTheDocument();
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "http://localhost:3001/conversations/conv_1/shares",
      expect.objectContaining({ method: "POST" })
    );
  });
});

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    status
  });
}
