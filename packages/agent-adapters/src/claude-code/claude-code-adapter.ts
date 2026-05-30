import type {
  AgentAdapter,
  AgentExecutionRequest,
  AgentExecutionResult
} from "@agenthub/agent-sdk";
import { AgentAdapterError } from "@agenthub/agent-sdk";
import type { StreamEvent } from "@agenthub/contracts";

import {
  buildPromptMessages,
  jsonRequestInit,
  readServerSentEvents,
  type StreamingClientOptions
} from "../shared/streaming-client.js";
import type {
  ClaudeCodeRequestBody,
  ClaudeCodeStreamEvent
} from "./claude-code-types.js";

export class ClaudeCodeAdapter implements AgentAdapter {
  readonly provider = "claude-code" as const;

  private readonly baseUrl: string;
  private readonly credentialResolver: StreamingClientOptions["credentialResolver"];
  private readonly fetchImpl: typeof fetch;
  private readonly model: string;

  constructor(options: StreamingClientOptions & { model?: string }) {
    this.baseUrl =
      options.baseUrl ?? process.env.CLAUDE_CODE_BASE_URL ?? "https://api.claude-code.dev";
    this.credentialResolver = options.credentialResolver;
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
    this.model = options.model ?? process.env.CLAUDE_CODE_MODEL ?? "claude-code-default";
  }

  async execute(request: AgentExecutionRequest): Promise<AgentExecutionResult> {
    if (request.provider !== "claude-code") {
      throw new AgentAdapterError(
        `Claude Code adapter received provider ${request.provider} which it cannot handle.`,
        { code: "provider_mismatch" }
      );
    }

    const credentialId = request.credentialId;

    if (!credentialId) {
      throw new AgentAdapterError(
        "Claude Code adapter requires a BYOK credentialId on the execution request.",
        { code: "missing_credential" }
      );
    }

    const credential = await this.credentialResolver({
      credentialId,
      workspaceId: request.workspaceId
    });
    const requestBody: ClaudeCodeRequestBody = {
      agent_id: request.agentId,
      conversation_id: request.conversationId,
      messages: buildPromptMessages(
        request.message,
        request.context?.pinnedMessages,
        request.instructions
      ),
      model: this.model,
      stream: true,
      workspace_id: request.workspaceId
    };

    const response = await this.fetchImpl(`${this.baseUrl}/v1/messages`, {
      ...jsonRequestInit({
        body: requestBody,
        headers: {
          Accept: "text/event-stream",
          "Anthropic-Version": "2023-06-01",
          "Claude-Code-Account": credential.providerAccountId,
          "X-Api-Key": credential.secret
        }
      })
    });

    if (!response.ok) {
      throw new AgentAdapterError(
        `Claude Code responded with HTTP ${response.status} during streaming dispatch.`,
        {
          code: "provider_failed",
          retryable: response.status >= 500
        }
      );
    }

    const messageId = `${request.conversationId}:claude-code`;
    const streamEvents: StreamEvent[] = [
      {
        kind: "conversation.message.started",
        payload: { messageId }
      }
    ];
    const deltas: string[] = [];
    let stopped = false;

    for await (const sse of readServerSentEvents(response.body)) {
      if (sse.event === "message_stop") {
        stopped = true;
        break;
      }

      if (sse.event !== "content_block_delta") {
        continue;
      }

      const record = parseClaudeCodeEvent(sse.data);

      if (record?.type === "content_block_delta") {
        const delta = record.delta.text;
        if (delta.length > 0) {
          deltas.push(delta);
          streamEvents.push({
            kind: "conversation.message.delta",
            payload: { delta, messageId }
          });
        }
      }
    }

    const finalContent = deltas.join("");

    streamEvents.push({
      kind: "conversation.message.completed",
      payload: { finalContent, messageId }
    });

    if (!stopped && finalContent.length === 0) {
      throw new AgentAdapterError(
        "Claude Code stream ended before any content blocks were delivered.",
        { code: "provider_failed", retryable: true }
      );
    }

    return {
      finalContent,
      streamEvents
    };
  }
}

function parseClaudeCodeEvent(data: string): ClaudeCodeStreamEvent | null {
  try {
    return JSON.parse(data) as ClaudeCodeStreamEvent;
  } catch {
    return null;
  }
}

export function createClaudeCodeAdapter(
  options: StreamingClientOptions & { model?: string }
): ClaudeCodeAdapter {
  return new ClaudeCodeAdapter(options);
}
