export type ClaudeAgentSdkMessage = {
  content?: unknown;
  result?: unknown;
  session_id?: string;
  subtype?: string;
  type?: string;
};

export type ClaudeAgentQuery = (input: {
  options?: Record<string, unknown>;
  prompt: string;
}) => AsyncIterable<ClaudeAgentSdkMessage>;

export type ClaudeCodePermissionMode =
  | "acceptEdits"
  | "auto"
  | "bypassPermissions"
  | "default"
  | "dontAsk";
