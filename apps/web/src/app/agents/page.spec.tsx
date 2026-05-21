import "@testing-library/jest-dom/vitest";

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import AgentsPage from "./page";

const fetchMock = vi.fn<typeof fetch>();

describe("AgentsPage", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it("creates a custom agent and renders it in the saved agent list", async () => {
    const createdAgent = {
      avatarUrl: null,
      capabilityTags: ["release", "writing"],
      id: "agent_release_drafter",
      name: "Release Drafter",
      provider: "codex",
      systemPrompt: "Draft release notes and changelog summaries.",
      toolBindings: [],
      workspaceId: "default-workspace"
    };

    fetchMock
      .mockResolvedValueOnce(jsonResponse([], 200))
      .mockResolvedValueOnce(jsonResponse(createdAgent, 201))
      .mockResolvedValueOnce(jsonResponse([createdAgent], 200));

    render(<AgentsPage />);

    await screen.findByText("No custom agents have been saved yet.");

    fireEvent.change(screen.getByLabelText("Agent name"), {
      target: {
        value: "Release Drafter"
      }
    });
    fireEvent.change(screen.getByLabelText("Provider"), {
      target: {
        value: "codex"
      }
    });
    fireEvent.change(screen.getByLabelText("Capability tags"), {
      target: {
        value: "release, writing"
      }
    });
    fireEvent.change(screen.getByLabelText("System prompt"), {
      target: {
        value: "Draft release notes and changelog summaries."
      }
    });

    fireEvent.click(screen.getByRole("button", { name: "Create agent" }));

    await waitFor(() => {
      expect(screen.getByText("Release Drafter")).toBeInTheDocument();
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3001/custom-agents",
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
