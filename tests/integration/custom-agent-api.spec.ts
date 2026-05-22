import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { Client } from "pg";

import { createApp } from "../../apps/api/src/main.js";
import { signupSessionViaInject } from "../support/auth-session.js";

const workspaceId = "workspace_custom_agents_integration";

async function clearWorkspace(client: Client): Promise<void> {
  await client.query("DELETE FROM custom_agents WHERE workspace_id = $1", [workspaceId]);
}

describe("custom agents integration", () => {
  let app: NestFastifyApplication;
  let client: Client;
  let authCookie: string;

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
      displayName: "Custom Agents Integration",
      email: `custom-agents-integration-${Date.now()}@example.com`
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

  it("persists workspace-scoped custom agents and returns newest-first listings", async () => {
    const firstResponse = await app.inject({
      headers: {
        cookie: authCookie
      },
      method: "POST",
      payload: {
        capabilityTags: ["planning"],
        name: "Planner One",
        provider: "hermes",
        systemPrompt: "Break large work into clear milestones.",
        toolBindings: [],
        workspaceId
      },
      url: "/custom-agents"
    });

    expect(firstResponse.statusCode).toBe(201);

    const secondResponse = await app.inject({
      headers: {
        cookie: authCookie
      },
      method: "POST",
      payload: {
        capabilityTags: ["handoff", "ops"],
        name: "Ops Relay",
        provider: "mock",
        systemPrompt: "Route the next operational handoff.",
        toolBindings: [
          {
            configPath: null,
            name: "status-ledger",
            runtime: "server_registration"
          }
        ],
        workspaceId
      },
      url: "/custom-agents"
    });

    expect(secondResponse.statusCode).toBe(201);
    const created = secondResponse.json() as {
      id: string;
    };

    const listResponse = await app.inject({
      headers: {
        cookie: authCookie
      },
      method: "GET",
      url: `/custom-agents?workspaceId=${workspaceId}`
    });

    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json()).toEqual([
      expect.objectContaining({
        capabilityTags: ["handoff", "ops"],
        id: created.id,
        name: "Ops Relay",
        provider: "mock",
        systemPrompt: "Route the next operational handoff.",
        toolBindings: [
          {
            configPath: null,
            name: "status-ledger",
            runtime: "server_registration"
          }
        ],
        workspaceId
      }),
      expect.objectContaining({
        name: "Planner One",
        provider: "hermes"
      })
    ]);
  });
});
