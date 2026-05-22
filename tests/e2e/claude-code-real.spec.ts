import { createServer, type Server } from "node:http";
import { AddressInfo } from "node:net";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ClaudeCodeAdapter } from "../../packages/agent-adapters/src/claude-code/claude-code-adapter.js";

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
        `event: content_block_delta\ndata: ${JSON.stringify({
          delta: { text: "Hello ", type: "text_delta" },
          index: 0,
          type: "content_block_delta"
        })}\n\n`
      );
      response.write(
        `event: content_block_delta\ndata: ${JSON.stringify({
          delta: { text: "from ", type: "text_delta" },
          index: 0,
          type: "content_block_delta"
        })}\n\n`
      );
      response.write(
        `event: content_block_delta\ndata: ${JSON.stringify({
          delta: { text: "Claude Code", type: "text_delta" },
          index: 0,
          type: "content_block_delta"
        })}\n\n`
      );
      response.end(`event: message_stop\ndata: ${JSON.stringify({ type: "message_stop" })}\n\n`);
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

describe("Claude Code real-provider acceptance", () => {
  it("completes one end-to-end conversation through the real Claude Code adapter", async () => {
    const adapter = new ClaudeCodeAdapter({
      baseUrl,
      credentialResolver: async () => ({
        providerAccountId: "acct_claude_code_real",
        secret: "sk-ant-real-123"
      })
    });
    const result = await adapter.execute({
      agentId: "agent_claude_code_real",
      conversationId: "conv_claude_code_real",
      credentialId: "cred_claude_code_real",
      message: "Plan the rollout",
      provider: "claude-code",
      workspaceId: "workspace_claude_code_real"
    });

    expect(result.finalContent).toBe("Hello from Claude Code");
    expect(result.streamEvents.map((event) => event.kind)).toEqual([
      "conversation.message.started",
      "conversation.message.delta",
      "conversation.message.delta",
      "conversation.message.delta",
      "conversation.message.completed"
    ]);
    expect(requestLog.url).toBe("/v1/messages");
    expect(JSON.parse(requestLog.body ?? "{}")).toEqual(
      expect.objectContaining({
        agent_id: "agent_claude_code_real",
        conversation_id: "conv_claude_code_real",
        model: "claude-code-default",
        stream: true,
        workspace_id: "workspace_claude_code_real"
      })
    );
    expect(requestLog.headers?.["x-api-key"]).toBe("sk-ant-real-123");
    expect(requestLog.headers?.["claude-code-account"]).toBe("acct_claude_code_real");
    expect(requestLog.headers?.["anthropic-version"]).toBe("2023-06-01");
  });
});
