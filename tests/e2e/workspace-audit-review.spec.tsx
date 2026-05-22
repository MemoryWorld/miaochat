import "@testing-library/jest-dom/vitest";

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuditLogView } from "../../apps/web/src/features/workspaces/audit-log-view";

const fetchMock = vi.fn<typeof fetch>();

describe("workspace audit review", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it("renders the paginated audit log and loads the next page", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(
          {
            events: [
              {
                action: "member.invite",
                actorUserId: "user_owner",
                createdAt: "2026-05-22T09:00:00.000Z",
                details: { invitedEmail: "alice@example.com", role: "member" },
                eventHash: "hash-1",
                id: "evt_1",
                previousHash: null,
                resourceId: "inv_1",
                resourceType: "workspace_invitation",
                workspaceId: "default-workspace"
              }
            ],
            nextCursor: "evt_1"
          },
          200
        )
      )
      .mockResolvedValueOnce(
        jsonResponse(
          {
            events: [
              {
                action: "role.change",
                actorUserId: "user_owner",
                createdAt: "2026-05-22T08:30:00.000Z",
                details: {
                  nextRole: "admin",
                  previousRole: "member"
                },
                eventHash: "hash-2",
                id: "evt_2",
                previousHash: "hash-1",
                resourceId: "user_2",
                resourceType: "workspace_member",
                workspaceId: "default-workspace"
              }
            ],
            nextCursor: null
          },
          200
        )
      );

    render(<AuditLogView workspaceId="default-workspace" />);

    await waitFor(() => {
      expect(screen.getByText("member.invite")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Load more" }));

    await waitFor(() => {
      expect(screen.getByText("role.change")).toBeInTheDocument();
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "http://localhost:3001/workspaces/default-workspace/audit",
      expect.objectContaining({ credentials: "include" })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "http://localhost:3001/workspaces/default-workspace/audit?cursor=evt_1",
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
