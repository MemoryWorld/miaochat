import { randomUUID } from "node:crypto";

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { Client as TemporalClient, Connection } from "@temporalio/client";
import type { Worker } from "@temporalio/worker";
import { Client as PgClient } from "pg";

import { createApp } from "../../apps/api/src/main.js";
import { bootstrapWorker } from "../../apps/worker/src/main.js";
import { signupSessionViaFetch } from "../support/auth-session.js";

const emailPrefix = "deploy-workflow";
const workspaceId = "workspace_deploy_workflow";
const workerTaskQueuePrefix = "worker-task-deploy-workflow";

describe("deploy workflow integration", () => {
  let app: NestFastifyApplication;
  let authCookie: string;
  let baseUrl: string;
  let ownerUserId: string;
  let previousWorkerTaskQueue: string | undefined;
  let workerTaskQueue: string;
  let temporalClient: TemporalClient;
  let temporalConnection: Connection;
  let worker: Worker;
  let pgClient: PgClient;

  beforeAll(async () => {
    previousWorkerTaskQueue = process.env.WORKER_TASK_QUEUE;
    workerTaskQueue = `${workerTaskQueuePrefix}-${Date.now()}`;
    process.env.WORKER_TASK_QUEUE = workerTaskQueue;

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

    const session = await signupSessionViaFetch(baseUrl, {
      displayName: "Deploy Workflow",
      email: `${emailPrefix}-${Date.now()}@example.com`
    });
    authCookie = session.cookie;
    ownerUserId = session.user.id;

    const workspaceResponse = await fetch(`${baseUrl}/workspaces`, {
      body: JSON.stringify({
        id: workspaceId,
        name: "Deploy Workflow Workspace"
      }),
      headers: {
        "Content-Type": "application/json",
        cookie: authCookie
      },
      method: "POST"
    });

    expect(workspaceResponse.status).toBe(201);

    temporalConnection = await Connection.connect({
      address: process.env.TEMPORAL_ADDRESS ?? "localhost:7233"
    });
    temporalClient = new TemporalClient({
      connection: temporalConnection
    });

    worker = await bootstrapWorker();
  }, 20_000);

  afterEach(async () => {
    await clearFixtures(pgClient);
  });

  afterAll(async () => {
    await temporalConnection?.close();

    if (app) {
      await app.close();
    }

    await clearFixtures(pgClient);
    await pgClient.end();
    process.env.WORKER_TASK_QUEUE = previousWorkerTaskQueue;
  }, 20_000);

  it("runs a static-site deploy workflow, records progress, and persists the deployment row", async () => {
    const artifactId = randomUUID();
    const conversationId = randomUUID();
    const messageId = randomUUID();

    await pgClient.query(
      `
        INSERT INTO conversations (
          id,
          mode,
          owner_user_id,
          title,
          workspace_id
        )
        VALUES ($1, 'direct', $2, 'Deploy workflow conversation', $3)
      `,
      [conversationId, ownerUserId, workspaceId]
    );

    await pgClient.query(
      `
        INSERT INTO messages (
          content,
          conversation_id,
          id,
          owner_user_id,
          role,
          workspace_id
        )
        VALUES ($1, $2, $3, $4, 'user', $5)
      `,
      ["Deploy this artifact", conversationId, messageId, ownerUserId, workspaceId]
    );

    await pgClient.query(
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
        artifactId,
        messageId,
        "artifacts/deploy/marketing-site.zip",
        "Marketing Site Bundle",
        workspaceId
      ]
    );

    const targetResponse = await fetch(`${baseUrl}/deploys/targets`, {
      body: JSON.stringify({
        config: {
          provider: "netlify",
          siteId: "site_marketing"
        },
        credentialSource: "user_provided",
        kind: "static-site",
        name: "Marketing Preview",
        rawSecret: "deploy-secret-static",
        workspaceId
      }),
      headers: {
        "Content-Type": "application/json",
        cookie: authCookie
      },
      method: "POST"
    });

    expect(targetResponse.status).toBe(201);
    const deployTargetId = (await targetResponse.json()).id as string;

    await worker.runUntil(async () => {
      try {
        const deployment = await temporalClient.workflow.execute("deployArtifactWorkflow", {
          args: [
            {
              artifactId,
              deployTargetId,
              ownerUserId,
              workspaceId
            }
          ],
          taskQueue: workerTaskQueue,
          workflowId: `deploy:${artifactId}:${randomUUID()}`
        });

        expect(deployment).toMatchObject({
          artifactId,
          deployTargetId,
          ownerUserId,
          status: "succeeded",
          targetKind: "static-site",
          workspaceId
        });
        expect(
          deployment.progressEvents.map((event: { label: string }) => event.label)
        ).toEqual([
          "deployment.received",
          "deployment.running",
          "deployment.completed"
        ]);

        const row = await pgClient.query<{
          completed_at: Date | null;
          progress_events: Array<{ label: string }>;
          result_message: string;
          status: string;
          target_kind: string;
        }>(
          `
            SELECT
              completed_at,
              progress_events,
              result_message,
              status,
              target_kind
            FROM deployments
            WHERE id = $1
          `,
          [deployment.id]
        );

        expect(row.rows[0]?.status).toBe("succeeded");
        expect(row.rows[0]?.target_kind).toBe("static-site");
        expect(row.rows[0]?.result_message).toContain("Static site");
        expect(row.rows[0]?.completed_at).toBeTruthy();
        expect(row.rows[0]?.progress_events.map((event) => event.label)).toEqual([
          "deployment.received",
          "deployment.running",
          "deployment.completed"
        ]);
      } finally {
        worker.shutdown();
      }
    });
  }, 20_000);
});

async function clearFixtures(client: PgClient): Promise<void> {
  await client.query(
    "DELETE FROM conversations WHERE workspace_id = $1",
    [workspaceId]
  );
  await client.query(
    `DELETE FROM users WHERE email LIKE '${emailPrefix}-%@example.com'`
  );
}
