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

describe("single-agent mock flow", () => {
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

  it("creates a mock conversation, streams a reply, and reloads the persisted assistant message", async () => {
    const createdConversation = {
      id: "conv_mock_ui",
      mode: "direct",
      ownerUserId: "system-user",
      participants: [
        {
          agentId: "agent_mock",
          agentName: "Mock Builder"
        }
      ],
      pinnedMessageIds: [],
      title: "Mock Builder session",
      updatedAt: new Date().toISOString(),
      workspaceId: "default-workspace"
    };
    const userMessage = {
      content: "Build the mock slice",
      conversationId: "conv_mock_ui",
      createdAt: new Date().toISOString(),
      id: "msg_user_mock_ui",
      isPinned: false,
      role: "user",
      sourceAgentId: null,
      workspaceId: "default-workspace"
    };
    const persistedMessages = [
      userMessage,
      {
        content: "[mock:agent_mock] Build the mock slice",
        conversationId: "conv_mock_ui",
        createdAt: new Date().toISOString(),
        id: "msg_assistant_mock_ui",
        isPinned: false,
        role: "assistant",
        sourceAgentId: "agent_mock",
        workspaceId: "default-workspace"
      }
    ];

    fetchMock
      .mockResolvedValueOnce(jsonResponse([], 200))
      .mockResolvedValueOnce(jsonResponse(createdConversation, 201))
      .mockResolvedValueOnce(jsonResponse([], 200))
      .mockResolvedValueOnce(jsonResponse(userMessage, 202))
      .mockResolvedValueOnce(jsonResponse(persistedMessages, 200));

    render(<HomePage />);

    await screen.findByRole("button", { name: "Start mock conversation" });

    fireEvent.click(screen.getByRole("button", { name: "Start mock conversation" }));

    await waitFor(() => {
      expect(MockEventSource.instances).toHaveLength(1);
    });
    expect(MockEventSource.instances[0]?.url).toBe(
      "http://localhost:3001/streams/conv_mock_ui?workspaceId=default-workspace"
    );

    fireEvent.change(screen.getByLabelText("Message"), {
      target: {
        value: "Build the mock slice"
      }
    });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    await screen.findByText("Build the mock slice");

    MockEventSource.instances[0]?.emitOpen();
    MockEventSource.instances[0]?.emitMessage({
      kind: "conversation.message.started",
      payload: {
        messageId: "msg_assistant_mock_ui"
      }
    });
    MockEventSource.instances[0]?.emitMessage({
      kind: "conversation.message.delta",
      payload: {
        delta: "[mock:agent_mock] Build the mock slice",
        messageId: "msg_assistant_mock_ui"
      }
    });
    MockEventSource.instances[0]?.emitMessage({
      kind: "conversation.message.completed",
      payload: {
        finalContent: "[mock:agent_mock] Build the mock slice",
        messageId: "msg_assistant_mock_ui"
      }
    });

    await waitFor(() => {
      expect(
        screen.getByText("[mock:agent_mock] Build the mock slice")
      ).toBeInTheDocument();
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      "http://localhost:3001/messages/send",
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
