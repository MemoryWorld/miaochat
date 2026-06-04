import type {
  HarnessRuntimeContext,
  Message,
  ProviderId,
  RuntimeArtifactDraft,
  StreamEvent
} from "@agenthub/contracts";

export type AgentPinnedMessage = Pick<Message, "content" | "id" | "role">;

export type AgentExecutionContext = {
  harness?: HarnessRuntimeContext;
  pinnedMessages: AgentPinnedMessage[];
};

export type AgentExecutionRequest = {
  agentId: string;
  conversationId: string;
  context?: AgentExecutionContext;
  credentialId?: string;
  instructions?: string;
  message: string;
  provider: ProviderId;
  workspaceId: string;
};

export type AgentExecutionResult = {
  artifacts?: RuntimeArtifactDraft[];
  finalContent: string;
  runtimeMetadata?: Record<string, unknown>;
  streamEvents: StreamEvent[];
};

export type AgentAdapter = {
  execute(request: AgentExecutionRequest): Promise<AgentExecutionResult>;
  provider: ProviderId;
};
