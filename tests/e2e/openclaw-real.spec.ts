import { createServer, type Server } from "node:http";
import { AddressInfo } from "node:net";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { OpenClawAdapter } from "../../packages/agent-adapters/src/openclaw/openclaw-adapter.js";
import {
  assertStagingProviderResult,
  getStagingProviderRuntimeConfig,
  isStagingRealProviderMode
} from "./real-provider-test-support.js";

let server: Server;
let baseUrl: string;
let providerAccountId: string;
let secret: string;
const requestLog: { body?: string; headers?: Record<string, string | string[] | undefined>; url?: string } = {};
const stagingMode = isStagingRealProviderMode();

beforeAll(async () => {
  if (stagingMode) {
    const config = getStagingProviderRuntimeConfig("openclaw");
    baseUrl = config.baseUrl;
    providerAccountId = config.providerAccountId;
    secret = config.secret;
    return;
  }

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
      response.write(`data: ${JSON.stringify({ chunk: "Hello ", type: "chunk" })}\n\n`);
      response.write(`data: ${JSON.stringify({ chunk: "from ", type: "chunk" })}\n\n`);
      response.write(`data: ${JSON.stringify({ chunk: "OpenClaw", type: "chunk" })}\n\n`);
      response.write(
        `data: ${JSON.stringify({ finalContent: "Hello from OpenClaw", type: "completed" })}\n\n`
      );
      response.end("data: [DONE]\n\n");
    });
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;
  providerAccountId = "acct_openclaw_real";
  secret = "openclaw_secret_real_123";
});

afterAll(async () => {
  if (stagingMode) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

describe("OpenClaw real-provider acceptance", () => {
  it("completes one end-to-end conversation through the real OpenClaw adapter", async () => {
    const adapter = new OpenClawAdapter({
      baseUrl,
      credentialResolver: async () => ({
        providerAccountId,
        secret
      })
    });
    const result = await adapter.execute({
      agentId: "agent_openclaw_real",
      conversationId: "conv_openclaw_real",
      credentialId: "cred_openclaw_real",
      message: "Run the diff",
      provider: "openclaw",
      workspaceId: "workspace_openclaw_real"
    });

    if (stagingMode) {
      assertStagingProviderResult(result);
      return;
    }

    expect(result.finalContent).toBe("Hello from OpenClaw");
    expect(result.streamEvents.map((event) => event.kind)).toEqual([
      "conversation.message.started",
      "conversation.message.delta",
      "conversation.message.delta",
      "conversation.message.delta",
      "conversation.message.completed"
    ]);
    expect(requestLog.url).toBe("/v1/chat/completions");
    expect(JSON.parse(requestLog.body ?? "{}")).toEqual(
      expect.objectContaining({
        agentId: "agent_openclaw_real",
        conversationId: "conv_openclaw_real",
        stream: true,
        workspaceId: "workspace_openclaw_real"
      })
    );
    expect(requestLog.headers?.authorization).toBe(`Bearer ${secret}`);
    expect(requestLog.headers?.["openclaw-account"]).toBe(providerAccountId);
  });
});
