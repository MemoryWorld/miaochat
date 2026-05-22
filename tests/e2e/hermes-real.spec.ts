import { createServer, type Server } from "node:http";
import { AddressInfo } from "node:net";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { HermesAdapter } from "../../packages/agent-adapters/src/hermes/hermes-adapter.js";

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
      response.writeHead(200, { "content-type": "application/x-ndjson" });
      response.write(`${JSON.stringify({ type: "started" })}\n`);
      response.write(`${JSON.stringify({ text: "Hello ", type: "delta" })}\n`);
      response.write(`${JSON.stringify({ text: "from ", type: "delta" })}\n`);
      response.write(`${JSON.stringify({ text: "Hermes", type: "delta" })}\n`);
      response.end(`${JSON.stringify({ finalContent: "Hello from Hermes", type: "completed" })}\n`);
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

describe("Hermes real-provider acceptance", () => {
  it("completes one end-to-end conversation through the real Hermes adapter", async () => {
    const adapter = new HermesAdapter({
      baseUrl,
      credentialResolver: async () => ({
        providerAccountId: "acct_hermes_real",
        secret: "hermes_secret_real_123"
      })
    });
    const result = await adapter.execute({
      agentId: "agent_hermes_real",
      conversationId: "conv_hermes_real",
      credentialId: "cred_hermes_real",
      message: "Plan the release",
      provider: "hermes",
      workspaceId: "workspace_hermes_real"
    });

    expect(result.finalContent).toBe("Hello from Hermes");
    expect(result.streamEvents.map((event) => event.kind)).toEqual([
      "conversation.message.started",
      "conversation.message.delta",
      "conversation.message.delta",
      "conversation.message.delta",
      "conversation.message.completed"
    ]);
    expect(requestLog.url).toBe("/v1/messages/stream");
    expect(JSON.parse(requestLog.body ?? "{}" )).toEqual(
      expect.objectContaining({
        agentId: "agent_hermes_real",
        conversationId: "conv_hermes_real",
        prompt: "Plan the release",
        workspaceId: "workspace_hermes_real"
      })
    );
    expect(requestLog.headers?.authorization).toBe("Bearer hermes_secret_real_123");
    expect(requestLog.headers?.["hermes-account"]).toBe("acct_hermes_real");
  });
});
