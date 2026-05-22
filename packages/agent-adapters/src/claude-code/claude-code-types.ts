/**
 * Claude Code uses an SSE protocol with named events. Content deltas arrive as
 * `event: content_block_delta\ndata: { ... }`. The adapter normalizes the
 * relevant events into the shared streaming contract and ignores any other
 * named events surfaced by the upstream API.
 */
export type ClaudeCodeContentBlockDeltaEvent = {
  delta: {
    text: string;
    type: "text_delta";
  };
  index: number;
  type: "content_block_delta";
};

export type ClaudeCodeMessageStopEvent = {
  type: "message_stop";
};

export type ClaudeCodeStreamEvent =
  | ClaudeCodeContentBlockDeltaEvent
  | ClaudeCodeMessageStopEvent;

export type ClaudeCodeRequestBody = {
  agent_id: string;
  conversation_id: string;
  messages: Array<{ content: string; role: "assistant" | "system" | "user" }>;
  model: string;
  stream: true;
  workspace_id: string;
};
