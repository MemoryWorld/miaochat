import type {
  ProviderId,
  StreamEvent
} from "@agenthub/contracts";

export type AgentExecutionRequest = {
  agentId: string;
  conversationId: string;
  credentialId?: string;
  message: string;
  provider: ProviderId;
  workspaceId: string;
};

export type AgentExecutionResult = {
  finalContent: string;
  streamEvents: StreamEvent[];
};

export type AgentAdapter = {
  execute(request: AgentExecutionRequest): Promise<AgentExecutionResult>;
  provider: ProviderId;
};
