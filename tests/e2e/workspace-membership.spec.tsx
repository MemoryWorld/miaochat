import "@testing-library/jest-dom/vitest";

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { InviteDialog } from "../../apps/web/src/features/workspaces/invite-dialog";

const fetchMock = vi.fn<typeof fetch>();

describe("workspace membership flow", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it("invites a member, surfaces the issued token, and reflects the pending invitation", async () => {
    fetchMock
      // initial members
      .mockResolvedValueOnce(
        jsonResponse(
          [
            {
              joinedAt: "2026-05-22T00:00:00.000Z",
              role: "owner",
              userId: "user_owner",
              workspaceId: "default-workspace",
              workspaceOwnerUserId: "user_owner"
            }
          ],
          200
        )
      )
      // initial invitations
      .mockResolvedValueOnce(jsonResponse([], 200))
      // POST invitation
      .mockResolvedValueOnce(
        jsonResponse(
          {
            invitation: {
              acceptedAt: null,
              acceptedUserId: null,
              createdAt: "2026-05-22T00:01:00.000Z",
              expiresAt: "2026-05-29T00:01:00.000Z",
              id: "inv_test",
              invitedByUserId: "user_owner",
              invitedEmail: "alice@example.com",
              role: "member",
              status: "pending",
              workspaceId: "default-workspace",
              workspaceOwnerUserId: "user_owner"
            },
            token: "secret-token-123"
          },
          201
        )
      )
      // refresh members
      .mockResolvedValueOnce(
        jsonResponse(
          [
            {
              joinedAt: "2026-05-22T00:00:00.000Z",
              role: "owner",
              userId: "user_owner",
              workspaceId: "default-workspace",
              workspaceOwnerUserId: "user_owner"
            }
          ],
          200
        )
      )
      // refresh invitations
      .mockResolvedValueOnce(
        jsonResponse(
          [
            {
              acceptedAt: null,
              acceptedUserId: null,
              createdAt: "2026-05-22T00:01:00.000Z",
              expiresAt: "2026-05-29T00:01:00.000Z",
              id: "inv_test",
              invitedByUserId: "user_owner",
              invitedEmail: "alice@example.com",
              role: "member",
              status: "pending",
              workspaceId: "default-workspace",
              workspaceOwnerUserId: "user_owner"
            }
          ],
          200
        )
      );

    render(<InviteDialog workspaceId="default-workspace" onClose={() => undefined} />);

    await waitFor(() => {
      expect(screen.getByText(/user_owner — owner/)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText("Invited email"), {
      target: { value: "alice@example.com" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Send invitation" }));

    await waitFor(() => {
      expect(screen.getByTestId("latest-token")).toHaveTextContent("secret-token-123");
    });

    await waitFor(() => {
      expect(screen.getByText(/alice@example.com \(member\)/)).toBeInTheDocument();
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "http://localhost:3001/workspaces/default-workspace/invitations",
      expect.objectContaining({
        method: "POST"
      })
    );
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
