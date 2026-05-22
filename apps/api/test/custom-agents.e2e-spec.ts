import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { Client } from "pg";

import { createApp } from "../src/main.js";
import { signupSessionViaInject } from "../../../tests/support/auth-session.js";

const workspaceId = "workspace_custom_agents_e2e";

async function clearWorkspace(client: Client): Promise<void> {
  await client.query("DELETE FROM custom_agents WHERE workspace_id = $1", [workspaceId]);
}

describe("custom agents api", () => {
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
      displayName: "Custom Agents E2E",
      email: `custom-agents-e2e-${Date.now()}@example.com`
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

  it("creates and lists custom agents with prompts, tags, providers, and tool bindings", async () => {
    const createResponse = await app.inject({
      headers: {
        cookie: authCookie
      },
      method: "POST",
      payload: {
        avatarUrl: "https://example.com/reviewer.png",
        capabilityTags: ["code", "review"],
        name: "Release Reviewer",
        provider: "codex",
        systemPrompt: "Review the current release candidate before approval.",
        toolBindings: [
          {
            configPath: "/srv/tools/reviewer.json",
            name: "repo-review",
            runtime: "config_file"
          }
        ],
        workspaceId
      },
      url: "/custom-agents"
    });

    expect(createResponse.statusCode).toBe(201);
    expect(createResponse.json()).toMatchObject({
      avatarUrl: "https://example.com/reviewer.png",
      capabilityTags: ["code", "review"],
      name: "Release Reviewer",
      provider: "codex",
      systemPrompt: "Review the current release candidate before approval.",
      toolBindings: [
        {
          configPath: "/srv/tools/reviewer.json",
          name: "repo-review",
          runtime: "config_file"
        }
      ],
      workspaceId
    });

    const customAgentId = createResponse.json().id as string;

    const row = await client.query<{
      capability_tags: string[];
      name: string;
      provider: string;
      system_prompt: string;
      tool_bindings: Array<{
        configPath: string | null;
        name: string;
        runtime: "config_file" | "server_registration";
      }>;
    }>(
      `
        SELECT
          capability_tags,
          name,
          provider,
          system_prompt,
          tool_bindings
        FROM custom_agents
        WHERE id = $1
      `,
      [customAgentId]
    );

    expect(row.rows[0]).toMatchObject({
      capability_tags: ["code", "review"],
      name: "Release Reviewer",
      provider: "codex",
      system_prompt: "Review the current release candidate before approval.",
      tool_bindings: [
        {
          configPath: "/srv/tools/reviewer.json",
          name: "repo-review",
          runtime: "config_file"
        }
      ]
    });

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
        id: customAgentId,
        name: "Release Reviewer",
        provider: "codex",
        workspaceId
      })
    ]);
  });
});
