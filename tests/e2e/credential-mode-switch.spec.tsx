import "@testing-library/jest-dom/vitest";

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SetupFlow } from "../../apps/web/src/features/setup/setup-flow";

const fetchMock = vi.fn<typeof fetch>();

describe("credential mode switch flow", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it("switches the selected provider into platform-managed mode", async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify([]), {
          headers: { "Content-Type": "application/json" },
          status: 200
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify([]), {
          headers: { "Content-Type": "application/json" },
          status: 200
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify([]), {
          headers: { "Content-Type": "application/json" },
          status: 200
        })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            credentialSource: "platform_managed",
            provider: "codex",
            workspaceId: "default-workspace"
          }),
          {
            headers: { "Content-Type": "application/json" },
            status: 200
          }
        )
      );

    render(<SetupFlow />);

    await screen.findByText("Nothing has been saved in the default workspace yet.");

    fireEvent.click(screen.getByRole("button", { name: "Platform-managed" }));
    fireEvent.click(screen.getByRole("button", { name: "Enable platform-managed mode" }));

    await waitFor(() => {
      expect(screen.getByText("Platform-managed mode enabled")).toBeInTheDocument();
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      "http://localhost:3001/credentials/modes",
      expect.objectContaining({
        method: "POST"
      })
    );
  });
});
