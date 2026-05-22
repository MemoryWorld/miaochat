import { createServer, type Server } from "node:http";
import { AddressInfo } from "node:net";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { CodexAdapter } from "../../packages/agent-adapters/src/codex/codex-adapter.js";

let server: Server;
let baseUrl: string;
const requestLog: { body?: string; headers?: Record<string, string | string[] | undefined>; url?: string } = {};

beforeAll(async () => {
  server = createServer((request, response) => {
    requestLog.url = request.url ?? "";
    requestLog.headers = request.headers;
    let bodyChunks = "";
    request.on("data", (chunk) => {
      bodyChunks += chunk.toString("utf8");
    });
    request.on("end", () => {
      requestLog.body = bodyChunks;
      response.writeHead(200, {
        "cache-control": "no-cache",
        "content-type": "text/event-stream"
      });
      response.write(
        `data: ${JSON.stringify({
          choices: [{ delta: { role: "assistant" }, index: 0 }],
          id: "chatcmpl_real",
          model: "codex-default",
          object: "chat.completion.chunk"
        })}\n\n`
      );
      response.write(
        `data: ${JSON.stringify({
          choices: [{ delta: { content: "Hello " }, index: 0 }],
          id: "chatcmpl_real",
          model: "codex-default",
          object: "chat.completion.chunk"
        })}\n\n`
      );
      response.write(
        `data: ${JSON.stringify({
          choices: [
            {
              delta: { content: "from Codex" },
              finish_reason: "stop",
              index: 0
            }
          ],
          id: "chatcmpl_real",
          model: "codex-default",
          object: "chat.completion.chunk"
        })}\n\n`
      );
      response.end("data: [DONE]\n\n");
    });
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

describe("Codex real-provider acceptance", () => {
  it("completes one end-to-end conversation through the real Codex adapter", async () => {
    const adapter = new CodexAdapter({
      baseUrl,
      credentialResolver: async () => ({
        providerAccountId: "acct_codex_real",
        secret: "sk-codex-real-123"
      })
    });
    const result = await adapter.execute({
      agentId: "agent_codex_real",
      conversationId: "conv_codex_real",
      credentialId: "cred_codex_real",
      message: "Build the slice",
      provider: "codex",
      workspaceId: "workspace_codex_real"
    });

    expect(result.finalContent).toBe("Hello from Codex");
    expect(result.streamEvents.map((event) => event.kind)).toEqual([
      "conversation.message.started",
      "conversation.message.delta",
      "conversation.message.delta",
      "conversation.message.completed"
    ]);
    expect(requestLog.url).toBe("/v1/chat/completions");
    expect(JSON.parse(requestLog.body ?? "{}")).toEqual(
      expect.objectContaining({
        agent_id: "agent_codex_real",
        conversation_id: "conv_codex_real",
        model: "codex-default",
        stream: true,
        workspace_id: "workspace_codex_real"
      })
    );
    expect(requestLog.headers?.authorization).toBe("Bearer sk-codex-real-123");
    expect(requestLog.headers?.["codex-account"]).toBe("acct_codex_real");
  });
});
