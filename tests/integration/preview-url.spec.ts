import { randomUUID } from "node:crypto";

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import type {
  DeployCommandResult,
  Deployment
} from "@agenthub/contracts";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { Client as PgClient } from "pg";

import { createApp } from "../../apps/api/src/main.js";
import { bootstrapWorker } from "../../apps/worker/src/main.js";
import { signupSessionViaFetch } from "../support/auth-session.js";

const emailPrefix = "preview-url";
const previewBaseUrl = "https://preview.agenthub.test";
const workerTaskQueuePrefix = "worker-task-preview-url";

describe("preview URL provisioning", () => {
  let app: NestFastifyApplication;
  let baseUrl: string;
  let pgClient: PgClient;
  let previousPreviewBaseUrl: string | undefined;
  let previousWorkerTaskQueue: string | undefined;

  beforeAll(async () => {
    previousPreviewBaseUrl = process.env.PREVIEW_BASE_URL;
    previousWorkerTaskQueue = process.env.WORKER_TASK_QUEUE;
    process.env.PREVIEW_BASE_URL = previewBaseUrl;

    pgClient = new PgClient({
      connectionString:
        process.env.DATABASE_URL ?? "postgres://agenthub:agenthub@localhost:5432/agenthub"
    });
    await pgClient.connect();
    await clearFixtures(pgClient);

    app = await createApp();
    await app.listen({
      host: "127.0.0.1",
      port: 0
    });
    baseUrl = await app.getUrl();
  }, 20_000);

  afterEach(async () => {
    await clearFixtures(pgClient);
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }

    await clearFixtures(pgClient);
    await pgClient.end();
    process.env.PREVIEW_BASE_URL = previousPreviewBaseUrl;
    process.env.WORKER_TASK_QUEUE = previousWorkerTaskQueue;
  }, 20_000);

  it("returns a workspace-scoped preview URL for static-site deploys and rotates it on revocation", async () => {
    const queue = `${workerTaskQueuePrefix}-static-${Date.now()}`;
    process.env.WORKER_TASK_QUEUE = queue;

    const session = await signupSessionViaFetch(baseUrl, {
      displayName: "Preview URL Static",
      email: `${emailPrefix}-static-${Date.now()}@example.com`
    });
    const authCookie = session.cookie;
    const ownerUserId = session.user.id;
    const workspaceId = `workspace_preview_static_${Date.now()}`;
    const conversationId = randomUUID();
    const artifactId = randomUUID();

    await createWorkspace(baseUrl, authCookie, workspaceId, "Preview Static Workspace");
    await seedConversationArtifact(pgClient, {
      artifactId,
      artifactTitle: "Marketing Site Bundle",
      conversationId,
      ownerUserId,
      storageKey: "artifacts/deploy/marketing-site.zip",
      workspaceId
    });
    await createDeployTarget(baseUrl, authCookie, {
      config: {
        provider: "netlify",
        siteId: "site_marketing"
      },
      kind: "static-site",
      name: "Marketing Preview",
      workspaceId
    });

    const worker = await bootstrapWorker();
    let deploymentId = "";
    let issuedPreviewUrl = "";

    await worker.runUntil(async () => {
      try {
        const response = await fetch(`${baseUrl}/deploys`, {
          body: JSON.stringify({
            conversationId,
            targetName: "Marketing Preview",
            workspaceId
          }),
          headers: {
            "Content-Type": "application/json",
            cookie: authCookie
          },
          method: "POST"
        });

        expect(response.status).toBe(201);
        const payload = (await response.json()) as DeployCommandResult;

        deploymentId = payload.deployment.id;
        issuedPreviewUrl = payload.deployment.previewUrl ?? "";

        expect(payload.deployment.targetKind).toBe("static-site");
        expect(issuedPreviewUrl).toContain(
          `${previewBaseUrl}/workspaces/${workspaceId}/static-site/`
        );
        expect(issuedPreviewUrl).toContain("token=");
      } finally {
        worker.shutdown();
      }
    });

    const revokeResponse = await fetch(
      `${baseUrl}/deploys/${deploymentId}/preview-url/revoke?workspaceId=${workspaceId}`,
      {
        headers: {
          cookie: authCookie
        },
        method: "POST"
      }
    );

    expect(revokeResponse.status).toBe(200);
    const rotated = (await revokeResponse.json()) as Deployment;

    expect(rotated.previewUrl).not.toBeNull();
    expect(rotated.previewUrl).not.toBe(issuedPreviewUrl);
    expect(rotated.previewUrl).toContain(
      `${previewBaseUrl}/workspaces/${workspaceId}/static-site/`
    );

    const row = await pgClient.query<{ preview_url: string | null }>(
      `
        SELECT preview_url
        FROM deployments
        WHERE id = $1
      `,
      [deploymentId]
    );

    expect(row.rows[0]?.preview_url).toBe(rotated.previewUrl);
  }, 20_000);

  it("returns a workspace-scoped preview URL for container deploys", async () => {
    const queue = `${workerTaskQueuePrefix}-container-${Date.now()}`;
    process.env.WORKER_TASK_QUEUE = queue;

    const session = await signupSessionViaFetch(baseUrl, {
      displayName: "Preview URL Container",
      email: `${emailPrefix}-container-${Date.now()}@example.com`
    });
    const authCookie = session.cookie;
    const ownerUserId = session.user.id;
    const workspaceId = `workspace_preview_container_${Date.now()}`;
    const conversationId = randomUUID();
    const artifactId = randomUUID();

    await createWorkspace(baseUrl, authCookie, workspaceId, "Preview Container Workspace");
    await seedConversationArtifact(pgClient, {
      artifactId,
      artifactTitle: "Worker Container Image",
      conversationId,
      ownerUserId,
      storageKey: "artifacts/deploy/worker-image.tar",
      workspaceId
    });
    await createDeployTarget(baseUrl, authCookie, {
      config: {
        registry: "ghcr.io/agenthub"
      },
      kind: "container",
      name: "Worker Container",
      workspaceId
    });

    const worker = await bootstrapWorker();

    await worker.runUntil(async () => {
      try {
        const response = await fetch(`${baseUrl}/deploys`, {
          body: JSON.stringify({
            conversationId,
            targetName: "Worker Container",
            workspaceId
          }),
          headers: {
            "Content-Type": "application/json",
            cookie: authCookie
          },
          method: "POST"
        });

        expect(response.status).toBe(201);
        const payload = (await response.json()) as DeployCommandResult;

        expect(payload.deployment.targetKind).toBe("container");
        expect(payload.deployment.previewUrl).toContain(
          `${previewBaseUrl}/workspaces/${workspaceId}/container/`
        );
        expect(payload.deployment.previewUrl).toContain("token=");
      } finally {
        worker.shutdown();
      }
    });
  }, 20_000);
});

async function clearFixtures(client: PgClient): Promise<void> {
  await client.query(
    `DELETE FROM users WHERE email LIKE '${emailPrefix}-%@example.com'`
  );
}

async function createWorkspace(
  baseUrl: string,
  authCookie: string,
  workspaceId: string,
  name: string
): Promise<void> {
  const response = await fetch(`${baseUrl}/workspaces`, {
    body: JSON.stringify({
      id: workspaceId,
      name
    }),
    headers: {
      "Content-Type": "application/json",
      cookie: authCookie
    },
    method: "POST"
  });

  expect(response.status).toBe(201);
}

async function createDeployTarget(
  baseUrl: string,
  authCookie: string,
  input: {
    config: Record<string, unknown>;
    kind: "container" | "static-site";
    name: string;
    workspaceId: string;
  }
): Promise<void> {
  const response = await fetch(`${baseUrl}/deploys/targets`, {
    body: JSON.stringify({
      ...input,
      credentialSource: "user_provided",
      rawSecret: "deploy-secret-value"
    }),
    headers: {
      "Content-Type": "application/json",
      cookie: authCookie
    },
    method: "POST"
  });

  expect(response.status).toBe(201);
}

async function seedConversationArtifact(
  client: PgClient,
  input: {
    artifactId: string;
    artifactTitle: string;
    conversationId: string;
    ownerUserId: string;
    storageKey: string;
    workspaceId: string;
  }
): Promise<void> {
  const messageId = randomUUID();

  await client.query(
    `
      INSERT INTO conversations (
        id,
        mode,
        owner_user_id,
        title,
        workspace_id
      )
      VALUES ($1, 'direct', $2, 'Preview deploy conversation', $3)
    `,
    [input.conversationId, input.ownerUserId, input.workspaceId]
  );

  await client.query(
    `
      INSERT INTO messages (
        content,
        conversation_id,
        id,
        owner_user_id,
        role,
        workspace_id
      )
      VALUES ($1, $2, $3, $4, 'assistant', $5)
    `,
    ["Deploy this artifact", input.conversationId, messageId, input.ownerUserId, input.workspaceId]
  );

  await client.query(
    `
      INSERT INTO artifacts (
        id,
        kind,
        message_id,
        mime_type,
        storage_key,
        title,
        workspace_id
      )
      VALUES ($1, 'attachment', $2, 'application/zip', $3, $4, $5)
    `,
    [
      input.artifactId,
      messageId,
      input.storageKey,
      input.artifactTitle,
      input.workspaceId
    ]
  );
}
