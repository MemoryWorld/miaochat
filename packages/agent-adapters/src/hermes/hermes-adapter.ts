import type {
  AgentAdapter,
  AgentExecutionRequest,
  AgentExecutionResult
} from "@agenthub/agent-sdk";
import { AgentAdapterError, createMessageLifecycleEvents } from "@agenthub/agent-sdk";
import type { StreamEvent } from "@agenthub/contracts";

import {
  buildPromptMessages,
  jsonRequestInit,
  readResponseLines,
  type StreamingClientOptions
} from "../shared/streaming-client.js";
import type {
  HermesRequestBody,
  HermesStreamRecord
} from "./hermes-types.js";

export class HermesAdapter implements AgentAdapter {
  readonly provider = "hermes" as const;

  private readonly baseUrl: string;
  private readonly credentialResolver: StreamingClientOptions["credentialResolver"];
  private readonly fetchImpl: typeof fetch;

  constructor(options: StreamingClientOptions) {
    this.baseUrl = options.baseUrl ?? process.env.HERMES_BASE_URL ?? "https://api.hermes.dev";
    this.credentialResolver = options.credentialResolver;
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
  }

  async execute(request: AgentExecutionRequest): Promise<AgentExecutionResult> {
    if (request.provider !== "hermes") {
      throw new AgentAdapterError(
        `Hermes adapter received provider ${request.provider} which it cannot handle.`,
        { code: "provider_mismatch" }
      );
    }

    const credentialId = request.credentialId;

    if (!credentialId) {
      throw new AgentAdapterError(
        "Hermes adapter requires a BYOK credentialId on the execution request.",
        { code: "missing_credential" }
      );
    }

    const credential = await this.credentialResolver({
      credentialId,
      workspaceId: request.workspaceId
    });
    const requestBody: HermesRequestBody = {
      agentId: request.agentId,
      conversationId: request.conversationId,
      pinnedMessages: buildPromptMessages(
        request.message,
        request.context?.pinnedMessages,
        request.instructions
      ).slice(0, -1),
      prompt: request.message,
      workspaceId: request.workspaceId
    };

    const response = await this.fetchImpl(`${this.baseUrl}/v1/messages/stream`, {
      ...jsonRequestInit({
        body: requestBody,
        headers: {
          Authorization: `Bearer ${credential.secret}`,
          "Hermes-Account": credential.providerAccountId
        }
      })
    });

    if (!response.ok) {
      throw new AgentAdapterError(
        `Hermes responded with HTTP ${response.status} during streaming dispatch.`,
        {
          code: "provider_failed",
          retryable: response.status >= 500
        }
      );
    }

    const messageId = `${request.conversationId}:hermes`;
    const streamEvents: StreamEvent[] = [
      {
        kind: "conversation.message.started",
        payload: { messageId }
      }
    ];
    const deltas: string[] = [];
    let finalContent: string | null = null;

    for await (const line of readResponseLines(response.body)) {
      const record = parseHermesRecord(line);
      if (!record) {
        continue;
      }

      if (record.type === "delta") {
        deltas.push(record.text);
        streamEvents.push({
          kind: "conversation.message.delta",
          payload: { delta: record.text, messageId }
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

function parseHermesRecord(line: string): HermesStreamRecord | null {
  try {
    const parsed = JSON.parse(line) as HermesStreamRecord;

    if (
      parsed.type === "delta" ||
      parsed.type === "completed" ||
      parsed.type === "error" ||
      parsed.type === "started"
    ) {
      return parsed;
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Convenience factory for constructing the adapter with the lifecycle helpers
 * exposed by the SDK. Kept for parity with the mock adapter so worker code does
 * not need to know about the lifecycle helper directly.
 */
export function createHermesAdapter(options: StreamingClientOptions): HermesAdapter {
  return new HermesAdapter(options);
}

export { createMessageLifecycleEvents };
