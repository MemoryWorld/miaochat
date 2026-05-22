/**
 * Hermes uses an NDJSON streaming protocol where each line is a JSON record
 * with a `type` discriminator. The shapes here are kept narrow on purpose;
 * unrecognized event types are ignored by the adapter so the upstream protocol
 * can grow without breaking the normalized contract.
 */
export type HermesStreamRecord =
  | HermesDeltaRecord
  | HermesCompletedRecord
  | HermesErrorRecord
  | HermesStartedRecord;

export type HermesStartedRecord = {
  type: "started";
};

export type HermesDeltaRecord = {
  text: string;
  type: "delta";
};

export type HermesCompletedRecord = {
  finalContent: string;
  type: "completed";
};

export type HermesErrorRecord = {
  message: string;
  retryable?: boolean;
  type: "error";
};

export type HermesRequestBody = {
  agentId: string;
  conversationId: string;
  pinnedMessages: Array<{ content: string; role: "assistant" | "system" | "user" }>;
  prompt: string;
  workspaceId: string;
};
