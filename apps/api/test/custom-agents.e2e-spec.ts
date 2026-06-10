import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { Client } from "pg";

import { createApp } from "../src/main.js";
import { signupSessionViaInject } from "../../../tests/support/auth-session.js";

const workspaceId = "workspace_custom_agents_e2e";

async function clearWorkspace(client: Client): Promise<void> {
  await client.query("DELETE FROM custom_agents WHERE workspace_id = $1", [workspaceId]);
  await client.query("DELETE FROM provider_credentials WHERE workspace_id = $1", [workspaceId]);
}

async function seedCredential(
  client: Client,
  input: {
    id: string;
    ownerUserId: string;
    provider?: string;
    validationState?: string;
  }
): Promise<void> {
  await client.query(
    `
      INSERT INTO provider_credentials (
        id,
        credential_source,
        encrypted_secret,
        label,
        owner_user_id,
        provider,
        provider_account_id,
        validation_state,
        workspace_id
      )
      VALUES ($1, 'user_provided', 'encrypted_test_secret', 'Test connection', $2, $3, 'test/model', $4, $5)
      ON CONFLICT (id) DO UPDATE SET
        validation_state = EXCLUDED.validation_state
    `,
    [
      input.id,
      input.ownerUserId,
      input.provider ?? "codex",
      input.validationState ?? "valid",
      workspaceId
    ]
  );
}

describe("custom agents api", () => {
  let app: NestFastifyApplication;
  let client: Client;
  let authCookie: string;
  let ownerUserId: string;

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
    ownerUserId = session.user.id;
  });

  afterEach(async () => {
    await clearWorkspace(client);
  });

  afterAll(async () => {
    await app.close();
    await client.end();
  });

  it("creates and lists custom agents with prompts, tags, providers, and tool bindings", async () => {
    await seedCredential(client, {
      id: "cred_custom_agents_codex",
      ownerUserId,
      provider: "codex"
    });

    const createResponse = await app.inject({
      headers: {
        cookie: authCookie
      },
      method: "POST",
      payload: {
        avatarUrl: "https://example.com/reviewer.png",
        capabilityTags: ["code", "review"],
        modelProfileId: "cred_custom_agents_codex",
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
      model_profile_id: string | null;
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
          model_profile_id,
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
      model_profile_id: "cred_custom_agents_codex",
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

  it("auto-renames duplicate custom agent names in the same workspace", async () => {
    await seedCredential(client, {
      id: "cred_custom_agents_duplicate",
      ownerUserId,
      provider: "codex"
    });

    const createAgent = async () =>
      app.inject({
        headers: {
          cookie: authCookie
        },
        method: "POST",
        payload: {
          capabilityTags: ["code"],
          modelProfileId: "cred_custom_agents_duplicate",
          name: "Release Reviewer",
          provider: "codex",
          systemPrompt: "Review the current release candidate before approval.",
          toolBindings: [],
          workspaceId
        },
        url: "/custom-agents"
      });

    const firstResponse = await createAgent();
    const secondResponse = await createAgent();
    const thirdResponse = await createAgent();

    expect(firstResponse.statusCode).toBe(201);
    expect(secondResponse.statusCode).toBe(201);
    expect(thirdResponse.statusCode).toBe(201);
    expect(firstResponse.json()).toMatchObject({ name: "Release Reviewer" });
    expect(secondResponse.json()).toMatchObject({ name: "Release Reviewer1" });
    expect(thirdResponse.json()).toMatchObject({ name: "Release Reviewer2" });
  });

  it("rejects custom agents without a verified compatible model connection", async () => {
    await seedCredential(client, {
      id: "cred_custom_agents_invalid",
      ownerUserId,
      provider: "codex",
      validationState: "invalid"
    });

    const createResponse = await app.inject({
      headers: {
        cookie: authCookie
      },
      method: "POST",
      payload: {
        capabilityTags: ["code"],
        modelProfileId: "cred_custom_agents_invalid",
        name: "Invalid Connection Agent",
        provider: "codex",
        systemPrompt: "This agent should not be created.",
        toolBindings: [],
        workspaceId
      },
      url: "/custom-agents"
    });

    expect(createResponse.statusCode).toBe(400);
    expect(createResponse.json()).toMatchObject({
      message: "请选择一个已验证且可用的模型连接。"
    });
  });
});
