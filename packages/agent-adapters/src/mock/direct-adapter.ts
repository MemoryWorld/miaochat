import type {
  AgentAdapter,
  AgentExecutionRequest,
  AgentExecutionResult
} from "@agenthub/agent-sdk";
import { createMessageLifecycleEvents } from "@agenthub/agent-sdk";

export class MockDirectAdapter implements AgentAdapter {
  readonly provider = "mock" as const;

  async execute(request: AgentExecutionRequest): Promise<AgentExecutionResult> {
    const replayedPinnedMessages =
      request.context?.pinnedMessages
        .map((message) => `[pinned] ${message.content}`)
        .join("\n") ?? "";
    const finalContent =
      replayedPinnedMessages.length > 0
        ? `[mock:${request.agentId}] ${request.message}\n${replayedPinnedMessages}`
        : `[mock:${request.agentId}] ${request.message}`;
    const streamEvents = createMessageLifecycleEvents({
      finalContent,
      messageId: `${request.conversationId}:assistant`
    });

    return {
      finalContent,
      streamEvents
    };
  }
}
