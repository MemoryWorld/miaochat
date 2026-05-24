import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ChatExperience } from "./chat-experience";

const fetchMock = vi.fn<typeof fetch>();

describe("ChatExperience", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it("does not crash when the conversations endpoint returns a non-array error payload", async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ authenticated: false }), {
          headers: {
            "Content-Type": "application/json"
          },
          status: 200
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify([]), {
          headers: {
            "Content-Type": "application/json"
          },
          status: 200
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ message: "Authentication required." }), {
          headers: {
            "Content-Type": "application/json"
          },
          status: 401
        })
      );

    render(<ChatExperience />);

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(
          ([url, options]) =>
            url === "http://localhost:3001/conversations?workspaceId=default-workspace" &&
            typeof options === "object" &&
            options !== null &&
            "credentials" in options &&
            options.credentials === "include"
        )
      ).toBe(true);
    });

    expect(
      await screen.findByText("No conversations yet. Start the seeded mock direct conversation first.")
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Log in" })).toBeInTheDocument();
    expect(screen.getByText("Authentication required.")).toBeInTheDocument();
  });
});
