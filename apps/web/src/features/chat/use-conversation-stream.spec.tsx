// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { StreamEvent } from "@agenthub/contracts";

import { useConversationStream } from "./use-conversation-stream";

class MockEventSource {
  static instances: MockEventSource[] = [];

  readonly close = vi.fn();
  readonly init: EventSourceInit | undefined;
  readonly url: string;
  onerror: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent<string>) => void) | null = null;
  onopen: ((event: Event) => void) | null = null;

  constructor(url: string, init?: EventSourceInit) {
    this.init = init;
    this.url = url;
    MockEventSource.instances.push(this);
  }

  emitError() {
    this.onerror?.(new Event("error"));
  }

  emitMessage(event: StreamEvent) {
    this.onmessage?.(
      new MessageEvent("message", {
        data: JSON.stringify(event)
      })
    );
  }

  emitOpen() {
    this.onopen?.(new Event("open"));
  }
}

function StreamProbe(props: {
  conversationId: string;
  workspaceId?: string;
}) {
  const stream = useConversationStream(props);

  return (
    <div>
      <p>state:{stream.connectionState}</p>
      <p>count:{stream.events.length}</p>
      <p>last:{stream.lastEvent?.kind ?? "none"}</p>
      <p>error:{stream.errorMessage ?? "none"}</p>
    </div>
  );
}

describe("useConversationStream", () => {
  beforeEach(() => {
    vi.stubGlobal("EventSource", MockEventSource);
    MockEventSource.instances = [];
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("opens the conversation SSE stream and appends validated events", async () => {
    const view = render(
      <StreamProbe
        conversationId="conv_task_17"
        workspaceId="workspace_task_17"
      />
    );

    expect(MockEventSource.instances).toHaveLength(1);
    expect(MockEventSource.instances[0]?.url).toBe(
      "http://localhost:3001/streams/conv_task_17?workspaceId=workspace_task_17"
    );
    expect(MockEventSource.instances[0]?.init).toEqual({
      withCredentials: true
    });

    MockEventSource.instances[0]?.emitOpen();

    await screen.findByText("state:open");

    MockEventSource.instances[0]?.emitMessage({
      kind: "conversation.message.started",
      payload: {
        messageId: "message_task_17"
      }
    });
    MockEventSource.instances[0]?.emitMessage({
      kind: "conversation.message.completed",
      payload: {
        finalContent: "done",
        messageId: "message_task_17"
      }
    });

    await waitFor(() => {
      expect(screen.getByText("count:2")).toBeInTheDocument();
    });
    expect(screen.getByText("last:conversation.message.completed")).toBeInTheDocument();

    view.unmount();

    expect(MockEventSource.instances[0]?.close).toHaveBeenCalledTimes(1);
  });

  it("treats transient stream errors as reconnecting instead of surfacing a hard error state", async () => {
    render(
      <StreamProbe
        conversationId="conv_task_18"
        workspaceId="workspace_task_18"
      />
    );

    MockEventSource.instances[0]?.emitOpen();
    await screen.findByText("state:open");

    MockEventSource.instances[0]?.emitError();

    await waitFor(() => {
      expect(screen.getByText("state:connecting")).toBeInTheDocument();
    });
    expect(screen.getByText("error:none")).toBeInTheDocument();
  });
});
