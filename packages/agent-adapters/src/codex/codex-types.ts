/**
 * Codex follows the OpenAI-compatible streaming protocol. Each SSE event has a
 * JSON-encoded `data` field with `choices[0].delta.content` deltas, followed
 * by an `[DONE]` marker.
 */
export type CodexStreamChoice = {
  delta?: {
    content?: string;
    role?: "assistant";
  };
  finish_reason?: "length" | "stop" | null;
  index: number;
};

export type CodexStreamRecord = {
  choices: CodexStreamChoice[];
  id: string;
  model: string;
  object: "chat.completion.chunk";
};

export type CodexRequestBody = {
  agent_id: string;
  conversation_id: string;
  messages: Array<{ content: string; role: "assistant" | "system" | "user" }>;
  model: string;
  stream: true;
  workspace_id: string;
};
