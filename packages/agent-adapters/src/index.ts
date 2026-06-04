import type { AgentAdapter } from "@agenthub/agent-sdk";
import type { ProviderId } from "@agenthub/contracts";

import { ClaudeCodeAdapter } from "./claude-code/claude-code-adapter.js";
import { CodexAdapter } from "./codex/codex-adapter.js";
import { DeepSeekAdapter } from "./deepseek/deepseek-adapter.js";
import { HermesAdapter } from "./hermes/hermes-adapter.js";
import { MockDirectAdapter } from "./mock/direct-adapter.js";
import { MockGroupAdapter } from "./mock/group-adapter.js";
import { OpenClawAdapter } from "./openclaw/openclaw-adapter.js";
import type { StreamingClientOptions } from "./shared/streaming-client.js";

export * from "./claude-code/claude-code-adapter.js";
export * from "./claude-code/claude-code-types.js";
export * from "./codex/codex-adapter.js";
export * from "./codex/codex-types.js";
export * from "./deepseek/deepseek-adapter.js";
export * from "./hermes/hermes-adapter.js";
export * from "./hermes/hermes-types.js";
export * from "./mock/direct-adapter.js";
export * from "./mock/group-adapter.js";
export * from "./openclaw/openclaw-adapter.js";
export * from "./openclaw/openclaw-types.js";
export * from "./shared/streaming-client.js";
export * from "./shared/workspace-diff.js";

export type AgentExecutionMode = "direct" | "group";

export type CreateAgentAdapterInput = {
  executionMode: AgentExecutionMode;
  provider: ProviderId;
  streamingClientOptions?: StreamingClientOptions;
};

export function createAgentAdapter(input: CreateAgentAdapterInput): AgentAdapter {
  switch (input.provider) {
    case "mock":
      return input.executionMode === "direct"
        ? new MockDirectAdapter()
        : new MockGroupAdapter();
    case "hermes":
      return new HermesAdapter(requireStreamingClientOptions(input));
    case "openclaw":
      return new OpenClawAdapter(requireStreamingClientOptions(input));
    case "codex":
      return new CodexAdapter(requireStreamingClientOptions(input));
    case "deepseek":
      return new DeepSeekAdapter(requireStreamingClientOptions(input));
    case "claude-code":
      return new ClaudeCodeAdapter(requireStreamingClientOptions(input));
  }
}

function requireStreamingClientOptions(
  input: CreateAgentAdapterInput
): StreamingClientOptions {
  if (!input.streamingClientOptions) {
    throw new Error(
      `Provider ${input.provider} requires streaming client options for runtime execution.`
    );
  }

  return input.streamingClientOptions;
}
