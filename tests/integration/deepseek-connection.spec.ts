import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import type { ModelConnection } from "@agenthub/contracts";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { Client } from "pg";

import { createApp } from "../../apps/api/src/main.js";
import { signupSessionViaInject } from "../support/auth-session.js";

const workspaceId = "workspace_deepseek_connection";

describe("OpenCode-backed model connection integration", () => {
  let app: NestFastifyApplication;
  let authCookie: string;
  let client: Client;

  beforeAll(async () => {
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
    await clearWorkspace(client);
  });

  afterAll(async () => {
    await app.close();
    await client.end();
  });

  it("validates, saves, and lists a workspace model connection without exposing the secret", async () => {
    const validateResponse = await app.inject({
      headers: {
        cookie: authCookie
      },
      method: "POST",
      payload: {
        apiKey: "sk-test-opencode",
        label: "DeepSeek 连接",
        model: "deepseek/deepseek-chat",
        preset: "powerful",
        workspaceId
      },
      url: "/credentials/model-connections/validate"
    });

    expect(validateResponse.statusCode).toBe(200);
    expect(validateResponse.json()).toEqual(
      expect.objectContaining({
        providerAccountId: "deepseek/deepseek-chat",
        valid: true
      })
    );

    const createResponse = await app.inject({
      headers: {
        cookie: authCookie
      },
      method: "POST",
      payload: {
        apiKey: "sk-test-opencode",
        label: "DeepSeek 连接",
        model: "deepseek/deepseek-chat",
        preset: "powerful",
        workspaceId
      },
      url: "/credentials/model-connections"
    });

    expect(createResponse.statusCode).toBe(201);
    const created = createResponse.json() as ModelConnection;
    expect(created).toEqual(
      expect.objectContaining({
        kind: "opencode_model",
        label: "DeepSeek 连接",
        model: "deepseek/deepseek-chat",
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
    expect(JSON.stringify(listResponse.json())).not.toContain("sk-test-opencode");
  });

  it("returns a product-safe validation failure for keys with the wrong shape", async () => {
    const response = await app.inject({
      headers: {
        cookie: authCookie
      },
      method: "POST",
      payload: {
        apiKey: "bad",
        label: "DeepSeek 连接",
        model: "deepseek/deepseek-chat",
        workspaceId
      },
      url: "/credentials/model-connections/validate"
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(
      expect.objectContaining({
        message: "OpenCode 凭证格式不正确，请检查 provider id 和 API Key。",
        valid: false
      })
    );
  });
});

async function clearWorkspace(client: Client): Promise<void> {
  await client.query("DELETE FROM provider_credentials WHERE workspace_id = $1", [
    workspaceId
  ]);
}
