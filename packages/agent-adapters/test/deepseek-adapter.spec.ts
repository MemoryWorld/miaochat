import { describe, expect, it } from "vitest";

import { DeepSeekAdapter } from "../src/deepseek/deepseek-adapter.js";

const credentialResolver = async () => ({
  providerAccountId: "deepseek-chat",
  secret: "deepseek_secret_123"
});

function createSseResponseBody(records: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const lines = records.map((record) => `data: ${record}\n\n`).join("");

  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(lines));
      controller.close();
    }
  });
}

describe("DeepSeekAdapter", () => {
  it("sends the AI teammate harness instructions as the first system message", async () => {
    const requestLog: { body?: unknown } = {};
    const fetchImpl = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      requestLog.body = init?.body;

      return new Response(
        createSseResponseBody([
          JSON.stringify({ choices: [{ delta: { content: "收到" } }] }),
          "[DONE]"
        ]),
        {
          headers: { "content-type": "text/event-stream" },
          status: 200
        }
      );
    }) as unknown as typeof fetch;

    const adapter = new DeepSeekAdapter({
      baseUrl: "https://api.deepseek.test",
      credentialResolver,
      fetchImpl
    });

    const result = await adapter.execute({
      agentId: "agent_engineer",
      conversationId: "conv_deepseek",
      credentialId: "cred_deepseek",
      instructions: "你是软件工程师，只负责实现和测试。",
      message: "请设计登录页面逻辑",
      provider: "deepseek",
      workspaceId: "workspace_deepseek"
    });

    const body = JSON.parse(String(requestLog.body)) as {
      messages: Array<{ content: string; role: string }>;
      model: string;
    };

    expect(result.finalContent).toBe("收到");
    expect(body.model).toBe("deepseek-chat");
    expect(body.messages).toEqual([
      {
        content: "你是软件工程师，只负责实现和测试。",
        role: "system"
      },
      {
        content: "请设计登录页面逻辑",
        role: "user"
      }
    ]);
  });
});
