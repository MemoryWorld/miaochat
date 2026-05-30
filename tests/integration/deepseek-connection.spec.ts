import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import type { ModelConnection } from "@agenthub/contracts";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { Client } from "pg";

import { createApp } from "../../apps/api/src/main.js";
import { signupSessionViaInject } from "../support/auth-session.js";

const workspaceId = "workspace_deepseek_connection";

describe("DeepSeek model connection integration", () => {
  let app: NestFastifyApplication;
  let authCookie: string;
  let client: Client;
  let deepseekServer: Server;
  let previousDeepSeekBaseUrl: string | undefined;
  const validationRequests: string[] = [];

  beforeAll(async () => {
    previousDeepSeekBaseUrl = process.env.DEEPSEEK_BASE_URL;
    deepseekServer = createServer((request, response) => {
      let body = "";
      request.on("data", (chunk) => {
        body += chunk.toString("utf8");
      });
      request.on("end", () => {
        validationRequests.push(body);
        response.writeHead(200, {
          "content-type": "application/json"
        });
        response.end(JSON.stringify({ choices: [{ message: { content: "ok" } }] }));
      });
    });
    await new Promise<void>((resolve) => {
      deepseekServer.listen(0, "127.0.0.1", resolve);
    });
    process.env.DEEPSEEK_BASE_URL = `http://127.0.0.1:${(deepseekServer.address() as AddressInfo).port}`;

    client = new Client({
      connectionString:
        process.env.DATABASE_URL ?? "postgres://agenthub:agenthub@localhost:5432/agenthub"
    });
    await client.connect();
    await clearWorkspace(client);

    app = await createApp();
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    const session = await signupSessionViaInject(app, {
      displayName: "DeepSeek Connection",
      email: `deepseek-connection-${Date.now()}@example.com`
    });
    authCookie = session.cookie;
  });

  afterEach(async () => {
    validationRequests.length = 0;
    await clearWorkspace(client);
  });

  afterAll(async () => {
    await app.close();
    await client.end();
    await new Promise<void>((resolve, reject) => {
      deepseekServer.close((error) => (error ? reject(error) : resolve()));
    });
    restoreEnv("DEEPSEEK_BASE_URL", previousDeepSeekBaseUrl);
  });

  it("validates, saves, and lists a workspace model connection without exposing the secret", async () => {
    const validateResponse = await app.inject({
      headers: {
        cookie: authCookie
      },
      method: "POST",
      payload: {
        apiKey: "sk-test-deepseek",
        label: "DeepSeek 工作区连接",
        model: "deepseek-chat",
        preset: "powerful",
        workspaceId
      },
      url: "/credentials/model-connections/validate"
    });

    expect(validateResponse.statusCode).toBe(200);
    expect(validateResponse.json()).toEqual(
      expect.objectContaining({
        providerAccountId: "deepseek-chat",
        valid: true
      })
    );

    const createResponse = await app.inject({
      headers: {
        cookie: authCookie
      },
      method: "POST",
      payload: {
        apiKey: "sk-test-deepseek",
        label: "DeepSeek 工作区连接",
        model: "deepseek-chat",
        preset: "powerful",
        workspaceId
      },
      url: "/credentials/model-connections"
    });

    expect(createResponse.statusCode).toBe(201);
    const created = createResponse.json() as ModelConnection;
    expect(created).toEqual(
      expect.objectContaining({
        kind: "deepseek_api",
        label: "DeepSeek 工作区连接",
        model: "deepseek-chat",
        preset: "powerful",
        status: "valid",
        workspaceId
      })
    );

    const listResponse = await app.inject({
      headers: {
        cookie: authCookie
      },
      method: "GET",
      url: `/credentials/model-connections?workspaceId=${workspaceId}`
    });

    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json()).toEqual([
      expect.objectContaining({
        id: created.id,
        preset: "powerful",
        status: "valid"
      })
    ]);
    expect(JSON.stringify(listResponse.json())).not.toContain("sk-test-deepseek");
    expect(validationRequests.length).toBeGreaterThanOrEqual(2);
    expect(validationRequests.map(readValidationModel)).toContain("deepseek-chat");
  });

  it("returns a product-safe validation failure for keys with the wrong shape", async () => {
    const response = await app.inject({
      headers: {
        cookie: authCookie
      },
      method: "POST",
      payload: {
        apiKey: "bad-key",
        label: "DeepSeek 工作区连接",
        model: "deepseek-chat",
        workspaceId
      },
      url: "/credentials/model-connections/validate"
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(
      expect.objectContaining({
        message: "请输入以 sk- 开头的 DeepSeek API Key。",
        valid: false
      })
    );
    expect(validationRequests).toHaveLength(0);
  });
});

async function clearWorkspace(client: Client): Promise<void> {
  await client.query("DELETE FROM provider_credentials WHERE workspace_id = $1", [
    workspaceId
  ]);
}

function readValidationModel(body: string): string | null {
  try {
    return (JSON.parse(body) as { model?: string }).model ?? null;
  } catch {
    return null;
  }
}

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
    return;
  }

  process.env[name] = value;
}
