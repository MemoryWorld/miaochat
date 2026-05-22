import "@testing-library/jest-dom/vitest";

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ArtifactEditDispatcher } from "../../apps/web/src/features/chat/artifact-edit-dispatcher";

const fetchMock = vi.fn<typeof fetch>();

describe("artifact code editor", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it("posts a revision and dispatches a follow-up message when the user saves", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ id: "rev_1", revisionIndex: 1 }, 201))
      .mockResolvedValueOnce(jsonResponse({ id: "msg_1" }, 202));

    const onClose = vi.fn();

    render(
      <ArtifactEditDispatcher
        artifact={{
          createdAt: new Date(),
          id: "art_code",
          kind: "preview",
          messageId: "msg_origin",
          mimeType: "text/plain",
          previewUrl: null,
          storageKey: null,
          title: "Snippet",
          workspaceId: "default-workspace"
        }}
        conversationId="conv_1"
        initialContent="hello = 1"
        onClose={onClose}
      />
    );

    fireEvent.change(screen.getByLabelText("Code editor content"), {
      target: { value: "hello = 2" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Save and dispatch" }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "http://localhost:3001/artifacts/art_code/revisions?workspaceId=default-workspace",
      expect.objectContaining({ method: "POST" })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "http://localhost:3001/messages/send",
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
