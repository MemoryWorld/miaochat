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

  emitMessage(payload: unknown) {
    this.onmessage?.(
      new MessageEvent("message", {
        data: JSON.stringify(payload)
      })
    );
  }

  emitOpen() {
    this.onopen?.(new Event("open"));
  }
}

describe("group failure flow", () => {
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

  it("renders a structured partial-failure status card while keeping the degraded reply visible", async () => {
    const conversation = {
      id: "conv_group_failure_ui",
      mode: "group",
      ownerUserId: "system-user",
      participants: [
        {
          agentId: "agent_hermes",
          agentName: "Hermes Planner"
        },
        {
          agentId: "agent_failure",
          agentName: "Failure Scout"
        },
        {
          agentId: "agent_timeout",
          agentName: "Timeout Watcher"
        }
      ],
      pinnedMessageIds: [],
      title: "Group rollback planning",
      updatedAt: new Date().toISOString(),
      workspaceId: "default-workspace"
    };
    const userMessage = {
      content: "Plan the rollback path",
      conversationId: "conv_group_failure_ui",
      createdAt: new Date().toISOString(),
      id: "msg_group_failure_user",
      isPinned: false,
      mentionedAgentIds: [],
      role: "user",
      sourceAgentId: null,
      workspaceId: "default-workspace"
    };
    const assistantMessage = {
      content:
        "[Hermes Planner]\n[mock-group:agent_hermes] Plan the rollback path\n\nPartial failure\n- Failure Scout\n- Timeout Watcher",
      conversationId: "conv_group_failure_ui",
      createdAt: new Date().toISOString(),
      id: "msg_group_failure_assistant",
      isPinned: false,
      mentionedAgentIds: [],
      role: "assistant",
      sourceAgentId: null,
      workspaceId: "default-workspace"
    };

    fetchMock
      .mockResolvedValueOnce(jsonResponse([conversation], 200))
      .mockResolvedValueOnce(jsonResponse([], 200))
      .mockResolvedValueOnce(jsonResponse(userMessage, 202))
      .mockResolvedValueOnce(jsonResponse([userMessage, assistantMessage], 200));

    render(<HomePage />);

    await screen.findByRole("heading", { level: 2, name: "Group rollback planning" });

    await waitFor(() => {
      expect(MockEventSource.instances).toHaveLength(1);
    });

    MockEventSource.instances[0]?.emitOpen();

    fireEvent.change(screen.getByLabelText("Message"), {
      target: {
        value: "Plan the rollback path"
      }
    });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    await screen.findByText("Plan the rollback path");

    MockEventSource.instances[0]?.emitMessage({
      kind: "conversation.status",
      payload: {
        failures: [
          {
            agentId: "agent_failure",
            agentName: "Failure Scout",
            code: "error",
            detail: "Mock dispatch failed before completion.",
            provider: "mock"
          },
          {
            agentId: "agent_timeout",
            agentName: "Timeout Watcher",
            code: "timeout",
            detail: "Mock dispatch timed out before completion.",
            provider: "mock"
          }
        ],
        label: "orchestrator.partial_failure",
        state: "failed",
        successfulAgentCount: 1,
        summary: "2 of 3 agents failed or timed out. Aggregated the remaining result.",
        totalAgentCount: 3
      }
    });
    MockEventSource.instances[0]?.emitMessage({
      kind: "conversation.message.started",
      payload: {
        messageId: assistantMessage.id
      }
    });
    MockEventSource.instances[0]?.emitMessage({
      kind: "conversation.message.delta",
      payload: {
        delta: assistantMessage.content,
        messageId: assistantMessage.id
      }
    });
    MockEventSource.instances[0]?.emitMessage({
      kind: "conversation.message.completed",
      payload: {
        finalContent: assistantMessage.content,
        messageId: assistantMessage.id
      }
    });
    MockEventSource.instances[0]?.emitMessage({
      kind: "conversation.status",
      payload: {
        failures: [
          {
            agentId: "agent_failure",
            agentName: "Failure Scout",
            code: "error",
            detail: "Mock dispatch failed before completion.",
            provider: "mock"
          },
          {
            agentId: "agent_timeout",
            agentName: "Timeout Watcher",
            code: "timeout",
            detail: "Mock dispatch timed out before completion.",
            provider: "mock"
          }
        ],
        label: "orchestrator.aggregated",
        state: "succeeded",
        successfulAgentCount: 1,
        summary: "Completed with degraded output from 1 of 3 agents.",
        totalAgentCount: 3
      }
    });

    await screen.findByText("Orchestrator partial failure");
    await screen.findByText(
      "2 of 3 agents failed or timed out. Aggregated the remaining result."
    );
    await waitFor(() => {
      expect(
        screen.getAllByText((content) => content.includes("Failure Scout · error")).length
      ).toBeGreaterThan(0);
    });
    await waitFor(() => {
      expect(
        screen.getAllByText((content) => content.includes("Timeout Watcher · timeout"))
          .length
      ).toBeGreaterThan(0);
    });

    await waitFor(() => {
      expect(
        screen.getByText((content) =>
          content.includes("[Hermes Planner]") &&
          content.includes("[mock-group:agent_hermes] Plan the rollback path") &&
          content.includes("Partial failure")
        )
      ).toBeInTheDocument();
    });
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
