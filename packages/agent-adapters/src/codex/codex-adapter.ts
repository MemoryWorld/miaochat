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
  CodexRequestBody,
  CodexStreamRecord
} from "./codex-types.js";

export class CodexAdapter implements AgentAdapter {
  readonly provider = "codex" as const;

  private readonly baseUrl: string;
  private readonly credentialResolver: StreamingClientOptions["credentialResolver"];
  private readonly fetchImpl: typeof fetch;
  private readonly model: string;

  constructor(options: StreamingClientOptions & { model?: string }) {
    this.baseUrl = options.baseUrl ?? process.env.CODEX_BASE_URL ?? "https://api.codex.dev";
    this.credentialResolver = options.credentialResolver;
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
    this.model = options.model ?? process.env.CODEX_MODEL ?? "codex-default";
  }

  async execute(request: AgentExecutionRequest): Promise<AgentExecutionResult> {
    if (request.provider !== "codex") {
      throw new AgentAdapterError(
        `Codex adapter received provider ${request.provider} which it cannot handle.`,
        { code: "provider_mismatch" }
      );
    }

    const credentialId = request.credentialId;

    if (!credentialId) {
      throw new AgentAdapterError(
        "Codex adapter requires a BYOK credentialId on the execution request.",
        { code: "missing_credential" }
      );
    }

    const credential = await this.credentialResolver({
      credentialId,
      workspaceId: request.workspaceId
    });
    const requestBody: CodexRequestBody = {
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

    const response = await this.fetchImpl(`${this.baseUrl}/v1/chat/completions`, {
      ...jsonRequestInit({
        body: requestBody,
        headers: {
          Accept: "text/event-stream",
          Authorization: `Bearer ${credential.secret}`,
          "Codex-Account": credential.providerAccountId
        }
      })
    });

    if (!response.ok) {
      throw new AgentAdapterError(
        `Codex responded with HTTP ${response.status} during streaming dispatch.`,
        {
          code: "provider_failed",
          retryable: response.status >= 500
        }
      );
    }

    const messageId = `${request.conversationId}:codex`;
    const streamEvents: StreamEvent[] = [
      {
        kind: "conversation.message.started",
        payload: { messageId }
      }
    ];
    const deltas: string[] = [];

    for await (const sse of readServerSentEvents(response.body)) {
      if (sse.data === "[DONE]") {
        break;
      }

      const record = parseCodexRecord(sse.data);
      const delta = record?.choices?.[0]?.delta?.content;

      if (typeof delta === "string" && delta.length > 0) {
        deltas.push(delta);
        streamEvents.push({
          kind: "conversation.message.delta",
          payload: { delta, messageId }
        });
      }
    }

    const finalContent = deltas.join("");

    streamEvents.push({
      kind: "conversation.message.completed",
      payload: { finalContent, messageId }
    });

    return {
      finalContent,
      streamEvents
    };
  }
}

function parseCodexRecord(data: string): CodexStreamRecord | null {
  try {
    return JSON.parse(data) as CodexStreamRecord;
  } catch {
    return null;
  }
}

export function createCodexAdapter(
  options: StreamingClientOptions & { model?: string }
): CodexAdapter {
  return new CodexAdapter(options);
}
