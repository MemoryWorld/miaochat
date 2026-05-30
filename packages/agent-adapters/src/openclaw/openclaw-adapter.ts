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
  OpenClawRequestBody,
  OpenClawStreamEvent
} from "./openclaw-types.js";

export class OpenClawAdapter implements AgentAdapter {
  readonly provider = "openclaw" as const;

  private readonly baseUrl: string;
  private readonly credentialResolver: StreamingClientOptions["credentialResolver"];
  private readonly fetchImpl: typeof fetch;

  constructor(options: StreamingClientOptions) {
    this.baseUrl =
      options.baseUrl ?? process.env.OPENCLAW_BASE_URL ?? "https://api.openclaw.dev";
    this.credentialResolver = options.credentialResolver;
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
  }

  async execute(request: AgentExecutionRequest): Promise<AgentExecutionResult> {
    if (request.provider !== "openclaw") {
      throw new AgentAdapterError(
        `OpenClaw adapter received provider ${request.provider} which it cannot handle.`,
        { code: "provider_mismatch" }
      );
    }

    const credentialId = request.credentialId;

    if (!credentialId) {
      throw new AgentAdapterError(
        "OpenClaw adapter requires a BYOK credentialId on the execution request.",
        { code: "missing_credential" }
      );
    }

    const credential = await this.credentialResolver({
      credentialId,
      workspaceId: request.workspaceId
    });
    const requestBody: OpenClawRequestBody = {
      agentId: request.agentId,
      conversationId: request.conversationId,
      messages: buildPromptMessages(
        request.message,
        request.context?.pinnedMessages,
        request.instructions
      ),
      stream: true,
      workspaceId: request.workspaceId
    };

    const response = await this.fetchImpl(`${this.baseUrl}/v1/chat/completions`, {
      ...jsonRequestInit({
        body: requestBody,
        headers: {
          Accept: "text/event-stream",
          Authorization: `Bearer ${credential.secret}`,
          "OpenClaw-Account": credential.providerAccountId
        }
      })
    });

    if (!response.ok) {
      throw new AgentAdapterError(
        `OpenClaw responded with HTTP ${response.status} during streaming dispatch.`,
        {
          code: "provider_failed",
          retryable: response.status >= 500
        }
      );
    }

    const messageId = `${request.conversationId}:openclaw`;
    const streamEvents: StreamEvent[] = [
      {
        kind: "conversation.message.started",
        payload: { messageId }
      }
    ];
    const deltas: string[] = [];
    let finalContent: string | null = null;

    for await (const sse of readServerSentEvents(response.body)) {
      if (sse.data === "[DONE]") {
        break;
      }

      const record = parseOpenClawEvent(sse.data);
      if (!record) {
        continue;
      }

      if (record.type === "chunk") {
        deltas.push(record.chunk);
        streamEvents.push({
          kind: "conversation.message.delta",
          payload: { delta: record.chunk, messageId }
        });
        continue;
      }

      if (record.type === "completed") {
        finalContent = record.finalContent;
        break;
      }

      if (record.type === "error") {
        throw new AgentAdapterError(record.message, {
          code: "provider_failed",
          retryable: record.retryable ?? false
        });
      }
    }

    const resolvedFinalContent = finalContent ?? deltas.join("");

    streamEvents.push({
      kind: "conversation.message.completed",
      payload: { finalContent: resolvedFinalContent, messageId }
    });

    return {
      finalContent: resolvedFinalContent,
      streamEvents
    };
  }
}

function parseOpenClawEvent(data: string): OpenClawStreamEvent | null {
  try {
    const parsed = JSON.parse(data) as OpenClawStreamEvent;

    if (
      parsed.type === "chunk" ||
      parsed.type === "completed" ||
      parsed.type === "error"
    ) {
      return parsed;
    }

    return null;
  } catch {
    return null;
  }
}

export function createOpenClawAdapter(options: StreamingClientOptions): OpenClawAdapter {
  return new OpenClawAdapter(options);
}
