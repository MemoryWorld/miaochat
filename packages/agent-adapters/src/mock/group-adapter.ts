import type {
  AgentAdapter,
  AgentExecutionRequest,
  AgentExecutionResult
} from "@agenthub/agent-sdk";
import { createMessageLifecycleEvents } from "@agenthub/agent-sdk";

export class MockGroupAdapter implements AgentAdapter {
  readonly provider = "mock" as const;

  async execute(request: AgentExecutionRequest): Promise<AgentExecutionResult> {
    const finalContent = `[mock-group:${request.agentId}] ${request.message}`;
    const streamEvents = createMessageLifecycleEvents({
      finalContent,
      messageId: `${request.conversationId}:group`
    });

    return {
      finalContent,
      streamEvents
    };
  }
}
