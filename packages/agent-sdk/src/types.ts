import type {
  HarnessRuntimeContext,
  Message,
  ProviderId,
  RuntimeArtifactDraft,
  StreamEvent
} from "@agenthub/contracts";

export type AgentContextMessage = Pick<Message, "content" | "id" | "role">;
export type AgentPinnedMessage = AgentContextMessage;

export type AgentExecutionContext = {
  harness?: HarnessRuntimeContext;
  pinnedMessages: AgentPinnedMessage[];
  recentMessages?: AgentContextMessage[];
};

export type AgentExecutionRequest = {
  agentId: string;
  conversationId: string;
  context?: AgentExecutionContext;
  credentialId?: string;
  instructions?: string;
  message: string;
  modelProfileId?: string | null;
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
