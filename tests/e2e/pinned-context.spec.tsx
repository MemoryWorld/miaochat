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

describe("pinned context flow", () => {
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

  it("pins a message and uses it in the next streamed assistant reply", async () => {
    const createdConversation = {
      id: "conv_pinned_ui",
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
    const firstUserMessage = {
      content: "Remember this pinned note",
      conversationId: "conv_pinned_ui",
      createdAt: new Date().toISOString(),
      id: "msg_user_pinned_1",
      isPinned: false,
      role: "user",
      sourceAgentId: null,
      workspaceId: "default-workspace"
    };
    const secondUserMessage = {
      content: "Use the pinned note",
      conversationId: "conv_pinned_ui",
      createdAt: new Date().toISOString(),
      id: "msg_user_pinned_2",
      isPinned: false,
      role: "user",
      sourceAgentId: null,
      workspaceId: "default-workspace"
    };
    const pinnedFirstMessage = {
      ...firstUserMessage,
      isPinned: true
    };
    const assistantMessage = {
      content: "[mock:agent_mock] Use the pinned note\n[pinned] Remember this pinned note",
      conversationId: "conv_pinned_ui",
      createdAt: new Date().toISOString(),
      id: "msg_assistant_pinned",
      isPinned: false,
      role: "assistant",
      sourceAgentId: "agent_mock",
      workspaceId: "default-workspace"
    };

    fetchMock
      .mockResolvedValueOnce(jsonResponse([], 200))
      .mockResolvedValueOnce(jsonResponse(createdConversation, 201))
      .mockResolvedValueOnce(jsonResponse([], 200))
      .mockResolvedValueOnce(jsonResponse(firstUserMessage, 202))
      .mockResolvedValueOnce(
        jsonResponse(
          {
            message: pinnedFirstMessage,
            pinnedMessageIds: [firstUserMessage.id]
          },
          200
        )
      )
      .mockResolvedValueOnce(jsonResponse(secondUserMessage, 202))
      .mockResolvedValueOnce(
        jsonResponse([pinnedFirstMessage, secondUserMessage, assistantMessage], 200)
      );

    render(<HomePage />);

    await screen.findByRole("button", { name: "Start mock conversation" });

    fireEvent.click(screen.getByRole("button", { name: "Start mock conversation" }));

    await waitFor(() => {
      expect(MockEventSource.instances).toHaveLength(1);
    });
    MockEventSource.instances[0]?.emitOpen();

    fireEvent.change(screen.getByLabelText("Message"), {
      target: {
        value: "Remember this pinned note"
      }
    });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    await screen.findByText("Remember this pinned note");
    fireEvent.click(await screen.findByRole("button", { name: "Pin message" }));

    await screen.findByText("Pinned");

    fireEvent.change(screen.getByLabelText("Message"), {
      target: {
        value: "Use the pinned note"
      }
    });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

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

    await waitFor(() => {
      expect(
        screen.getByText((content) =>
          content.includes("[mock:agent_mock] Use the pinned note") &&
          content.includes("[pinned] Remember this pinned note")
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
