import "@testing-library/jest-dom/vitest";

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { HeavyAgentForm } from "../../apps/web/src/features/agents/heavy-agent-form";

const fetchMock = vi.fn<typeof fetch>();

describe("heavy agent management UI", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it("registers a heavy agent with bound tools", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ id: "agent_heavy_1" }), {
        headers: { "Content-Type": "application/json" },
        status: 201
      })
    );

    const onCreated = vi.fn();
    render(<HeavyAgentForm onCreated={onCreated} workspaceId="default-workspace" />);

    fireEvent.change(screen.getByLabelText("Heavy agent name"), {
      target: { value: "Release Driver" }
    });
    fireEvent.change(screen.getByLabelText("Heavy agent system prompt"), {
      target: { value: "Drive the release pipeline." }
    });

    fireEvent.click(screen.getByRole("button", { name: "Add tool" }));
    expect(document.querySelector('[data-binding-name="github"]')).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Register heavy agent" }));

    await waitFor(() => {
      expect(onCreated).toHaveBeenCalledWith("agent_heavy_1");
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3001/custom-agents",
      expect.objectContaining({ method: "POST" })
    );
  });
});
