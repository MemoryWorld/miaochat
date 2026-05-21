import { describe, expect, it } from "vitest";

import { AgentAdapterError, createMessageLifecycleEvents } from "../src";

describe("@agenthub/agent-sdk", () => {
  it("creates a full normalized message lifecycle", () => {
    const events = createMessageLifecycleEvents({
      finalContent: "done",
      messageId: "msg_1"
    });

    expect(events.map((event) => event.kind)).toEqual([
      "conversation.message.started",
      "conversation.message.delta",
      "conversation.message.completed"
    ]);
  });

  it("marks adapter errors as non-retryable by default", () => {
    const error = new AgentAdapterError("boom");

    expect(error.retryable).toBe(false);
  });
});
