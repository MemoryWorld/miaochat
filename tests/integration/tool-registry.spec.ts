import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { Client } from "pg";

import { createApp } from "../../apps/api/src/main.js";
import { ToolRegistrationService } from "../../apps/api/src/modules/tools/tool-registration.service.js";

const workspaceId = "workspace_tool_registry";

async function clearWorkspace(client: Client): Promise<void> {
  await client.query("DELETE FROM custom_agents WHERE workspace_id = $1", [workspaceId]);
}

describe("tool registry integration", () => {
  let app: NestFastifyApplication;
  let client: Client;
  let configDirectory: string;

  beforeAll(async () => {
    client = new Client({
      connectionString:
        process.env.DATABASE_URL ?? "postgres://agenthub:agenthub@localhost:5432/agenthub"
    });
    await client.connect();
    await clearWorkspace(client);

    configDirectory = await mkdtemp(join(tmpdir(), "agenthub-tool-registry-"));

    await writeFile(
      join(configDirectory, "repo-review.json"),
      JSON.stringify({
        args: ["./scripts/review.mjs", "--workspace", workspaceId],
        command: "node",
        description: "Review the repository state before release.",
        name: "repo-review"
      }),
      "utf8"
    );

    app = await createApp();
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
    await clearWorkspace(client);
    await client.end();
    await rm(configDirectory, {
      force: true,
      recursive: true
    });
  });

  it("resolves custom-agent tool bindings from config files and server registrations", async () => {
    const service = app.get(ToolRegistrationService);

    service.registerServerTool({
      description: "Track shared status across the workspace.",
      handlerId: "status-ledger-handler",
      name: "status-ledger"
    });

    const createResponse = await app.inject({
      method: "POST",
      payload: {
        capabilityTags: ["ops", "release"],
        name: "Release Operator",
        provider: "mock",
        systemPrompt: "Coordinate the operational release handoff.",
        toolBindings: [
          {
            configPath: join(configDirectory, "repo-review.json"),
            name: "repo-review",
            runtime: "config_file"
          },
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

    expect(createResponse.statusCode).toBe(201);

    const resolved = await service.resolveAgentTools(
      createResponse.json().id as string,
      workspaceId
    );

    expect(resolved).toEqual([
      {
        description: "Review the repository state before release.",
        name: "repo-review",
        runtime: "config_file",
        source: {
          args: ["./scripts/review.mjs", "--workspace", workspaceId],
          command: "node",
          kind: "config_file",
          path: join(configDirectory, "repo-review.json")
        }
      },
      {
        description: "Track shared status across the workspace.",
        name: "status-ledger",
        runtime: "server_registration",
        source: {
          handlerId: "status-ledger-handler",
          kind: "server_registration"
        }
      }
    ]);
  });
});
