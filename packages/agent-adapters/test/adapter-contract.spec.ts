import { describe, expect, it } from "vitest";

import { MockDirectAdapter, MockGroupAdapter } from "../src";

describe("@agenthub/agent-adapters", () => {
  it("normalizes direct adapter streaming output", async () => {
    const adapter = new MockDirectAdapter();
    const result = await adapter.execute({
      agentId: "agent_1",
      conversationId: "conv_1",
      message: "hello",
      provider: "mock",
      workspaceId: "workspace_1"
    });

    expect(result.streamEvents.map((event) => event.kind)).toEqual([
      "conversation.message.started",
      "conversation.message.delta",
      "conversation.message.completed"
    ]);
  });

  it("normalizes group adapter output with deterministic content", async () => {
    const adapter = new MockGroupAdapter();
    const result = await adapter.execute({
      agentId: "agent_2",
      conversationId: "conv_2",
      message: "plan",
      provider: "mock",
      workspaceId: "workspace_1"
    });

    expect(result.finalContent).toContain("[mock-group:agent_2]");
  });

  it("includes pinned context in the mock direct adapter replay payload", async () => {
    const adapter = new MockDirectAdapter();
    const result = await adapter.execute({
      agentId: "agent_1",
      context: {
        pinnedMessages: [
          {
            content: "remember this note",
            id: "msg_pinned_1",
            role: "user"
          }
        ]
      },
      conversationId: "conv_1",
      message: "apply it",
      provider: "mock",
      workspaceId: "workspace_1"
    });

    expect(result.finalContent).toContain("[pinned] remember this note");
  });
});
