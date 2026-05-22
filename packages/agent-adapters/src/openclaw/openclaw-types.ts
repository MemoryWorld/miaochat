/**
 * OpenClaw uses an SSE-style streaming protocol. Each event has a JSON-encoded
 * `data` field carrying a chunk descriptor. The adapter ignores unknown event
 * shapes so the upstream protocol can grow without breaking the contract.
 */
export type OpenClawStreamEvent =
  | OpenClawDeltaEvent
  | OpenClawCompletedEvent
  | OpenClawErrorEvent;

export type OpenClawDeltaEvent = {
  chunk: string;
  type: "chunk";
};

export type OpenClawCompletedEvent = {
  finalContent: string;
  type: "completed";
};

export type OpenClawErrorEvent = {
  message: string;
  retryable?: boolean;
  type: "error";
};

export type OpenClawRequestBody = {
  agentId: string;
  conversationId: string;
  messages: Array<{ content: string; role: "assistant" | "system" | "user" }>;
  stream: true;
  workspaceId: string;
};
