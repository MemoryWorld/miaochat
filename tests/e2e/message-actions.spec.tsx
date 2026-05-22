import "@testing-library/jest-dom/vitest";

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MessageActionsMenu } from "../../apps/web/src/features/chat/message-actions-menu";

const fetchMock = vi.fn<typeof fetch>();

describe("message actions", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: vi.fn().mockResolvedValue(undefined)
      }
    });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it("supports quote, copy, regenerate, and apply diff", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          conversationId: "conv_1",
          messageId: "msg_1",
          regenerationId: "regen_msg_1_123"
        }),
        {
          headers: { "Content-Type": "application/json" },
          status: 202
        }
      )
    );

    const onQuote = vi.fn();
    const onApplyDiff = vi.fn();

    render(
      <MessageActionsMenu
        conversationId="conv_1"
        messageContent="Hello world"
        messageId="msg_1"
        onApplyDiff={onApplyDiff}
        onQuote={onQuote}
        workspaceId="default-workspace"
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    await waitFor(() =>
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith("Hello world")
    );

    fireEvent.click(screen.getByRole("button", { name: "Quote" }));
    expect(onQuote).toHaveBeenCalledWith("> Hello world\n\n");

    fireEvent.click(screen.getByRole("button", { name: "Apply diff" }));
    expect(onApplyDiff).toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Regenerate" }));
    await waitFor(() => {
      expect(screen.getByTestId("message-actions-status")).toHaveTextContent(
        "Regeneration queued."
      );
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3001/messages/msg_1/regenerate?workspaceId=default-workspace",
      expect.objectContaining({ method: "POST" })
    );
  });
});
