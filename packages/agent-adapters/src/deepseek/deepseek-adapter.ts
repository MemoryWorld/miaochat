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

type DeepSeekStreamRecord = {
  choices?: Array<{
    delta?: {
      content?: string;
    };
  }>;
};

export class DeepSeekAdapter implements AgentAdapter {
  readonly provider = "deepseek" as const;

  private readonly baseUrl: string;
  private readonly credentialResolver: StreamingClientOptions["credentialResolver"];
  private readonly fetchImpl: typeof fetch;

  constructor(options: StreamingClientOptions) {
    this.baseUrl = normalizeBaseUrl(
      options.baseUrl ?? process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com"
    );
    this.credentialResolver = options.credentialResolver;
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
  }

  async execute(request: AgentExecutionRequest): Promise<AgentExecutionResult> {
    if (request.provider !== "deepseek") {
      throw new AgentAdapterError(
        `DeepSeek adapter received provider ${request.provider} which it cannot handle.`,
        { code: "provider_mismatch" }
      );
    }

    if (!request.credentialId) {
      throw new AgentAdapterError("请先在设置中连接模型，再让 AI 同事执行。", {
        code: "missing_credential"
      });
    }

    const credential = await this.credentialResolver({
      credentialId: request.credentialId,
      workspaceId: request.workspaceId
    });
    const model = credential.providerAccountId || process.env.DEEPSEEK_MODEL || "deepseek-chat";
    const response = await this.fetchImpl(`${this.baseUrl}/v1/chat/completions`, {
      ...jsonRequestInit({
        body: {
          messages: buildPromptMessages(
            request.message,
            request.context?.pinnedMessages,
            request.instructions,
            request.context?.recentMessages
          ),
          model,
          stream: true
        },
        headers: {
          Accept: "text/event-stream",
          Authorization: `Bearer ${credential.secret}`
        }
      })
    });

    if (!response.ok) {
      throw new AgentAdapterError(mapDeepSeekError(response.status), {
        code: "provider_failed",
        retryable: response.status === 408 || response.status === 429 || response.status >= 500
      });
    }

    const messageId = `${request.conversationId}:deepseek`;
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

      const delta = parseDeepSeekRecord(sse.data)?.choices?.[0]?.delta?.content;
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

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, "");
}

function parseDeepSeekRecord(data: string): DeepSeekStreamRecord | null {
  try {
    return JSON.parse(data) as DeepSeekStreamRecord;
  } catch {
    return null;
  }
}

function mapDeepSeekError(status: number): string {
  if (status === 401 || status === 403) {
    return "模型连接不可用，请在设置中检查 API Key。";
  }
  if (status === 404) {
    return "当前模型不可用，请在设置中检查模型配置。";
  }
  if (status === 429) {
    return "模型服务暂时繁忙，请稍后重试。";
  }
  return "AI 同事执行失败，请稍后重试。";
}

export function createDeepSeekAdapter(options: StreamingClientOptions): DeepSeekAdapter {
  return new DeepSeekAdapter(options);
}
