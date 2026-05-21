import "@testing-library/jest-dom/vitest";

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import HomePage from "../../apps/web/src/app/page";

const fetchMock = vi.fn<typeof fetch>();

class MockEventSource {
  static instances: MockEventSource[] = [];

  readonly close = vi.fn();
  readonly url: string;
  onerror: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent<string>) => void) | null = null;
  onopen: ((event: Event) => void) | null = null;

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }
}

describe("custom agent UI flow", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("EventSource", MockEventSource);
    MockEventSource.instances = [];
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it("creates a direct conversation from a selected custom agent", async () => {
    const customAgent = {
      avatarUrl: null,
      capabilityTags: ["release", "writing"],
      id: "agent_release_drafter",
      name: "Release Drafter",
      provider: "codex",
      systemPrompt: "Draft release notes and changelog summaries.",
      toolBindings: [],
      workspaceId: "default-workspace"
    };
    const createdConversation = {
      id: "conv_release_drafter",
      mode: "direct",
      ownerUserId: "system-user",
      participants: [
        {
          agentId: customAgent.id,
          agentName: customAgent.name
        }
      ],
      pinnedMessageIds: [],
      title: "Release Drafter session",
      updatedAt: new Date().toISOString(),
      workspaceId: "default-workspace"
    };

    fetchMock
      .mockResolvedValueOnce(jsonResponse([], 200))
      .mockResolvedValueOnce(jsonResponse([customAgent], 200))
      .mockResolvedValueOnce(jsonResponse(createdConversation, 201))
      .mockResolvedValueOnce(jsonResponse([], 200));

    render(<HomePage />);

    await screen.findByRole("button", { name: "New conversation" });

    fireEvent.click(screen.getByRole("button", { name: "New conversation" }));
    fireEvent.change(await screen.findByLabelText("Agent"), {
      target: {
        value: customAgent.id
      }
    });
    fireEvent.click(screen.getByRole("button", { name: "Create conversation" }));

    await screen.findByRole("heading", {
      level: 2,
      name: "Release Drafter session"
    });

    await waitFor(() => {
      expect(MockEventSource.instances).toHaveLength(1);
    });

    expect(MockEventSource.instances[0]?.url).toBe(
      "http://localhost:3001/streams/conv_release_drafter?workspaceId=default-workspace"
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3001/conversations",
      expect.objectContaining({
        body: JSON.stringify({
          agentIds: [customAgent.id],
          mode: "direct",
          workspaceId: "default-workspace"
        }),
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
