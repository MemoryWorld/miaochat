import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type {
  ActivityRound,
  ApprovalRequest,
  CodingWorkflowDetail,
  InboxItem,
  MemoryRecord,
  StreamEvent
} from "@agenthub/contracts";
import { encryptCredentialSecret } from "../../packages/domain/src/index.ts";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import type { Worker } from "@temporalio/worker";
import { Client } from "pg";

import { createApp } from "../../apps/api/src/main.js";
import { bootstrapWorker } from "../../apps/worker/src/main.js";
import { signupSessionViaFetch } from "../support/auth-session.js";

const decoder = new TextDecoder();
const workspaceId = "workspace_coding_workflow_execution";
const workerTaskQueue = "worker-task-coding-workflow-execution";
const encryptionKey =
  process.env.CREDENTIAL_ENCRYPTION_KEY ?? "agenthub-dev-credential-key";

describe("coding workflow execution integration", () => {
  let app: NestFastifyApplication;
  let authCookie: string;
  let baseUrl: string;
  let client: Client;
  const deepseekRequests: string[] = [];
  let deepseekServer: Server;
  let ownerUserId: string;
  let previousDeepSeekBaseUrl: string | undefined;
  let previousWorkerTaskQueue: string | undefined;
  let worker: Worker;

  beforeAll(async () => {
    previousWorkerTaskQueue = process.env.WORKER_TASK_QUEUE;
    previousDeepSeekBaseUrl = process.env.DEEPSEEK_BASE_URL;
    process.env.WORKER_TASK_QUEUE = workerTaskQueue;

    deepseekServer = createServer((request, response) => {
      captureRequest(request, async (body) => {
        deepseekRequests.push(body);
        const prompt = readPromptFromDeepSeekRequest(body);
        const finalContent = resolveDeepSeekResponseForPrompt(prompt);

        response.writeHead(200, {
          "content-type": "text/event-stream"
        });
        response.write(
          `data: ${JSON.stringify({ choices: [{ delta: { content: finalContent } }] })}\n\n`
        );
        response.write("data: [DONE]\n\n");
        response.end();
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
    await app.listen({
      host: "127.0.0.1",
      port: 0
    });
    baseUrl = await app.getUrl();
    const session = await signupSessionViaFetch(baseUrl, {
      displayName: "Coding Workflow Execution",
      email: `coding-workflow-exec-${Date.now()}@example.com`
    });
    authCookie = session.cookie;
    ownerUserId = session.user.id;

    await seedCredential(client, ownerUserId);
    worker = await bootstrapWorker();
  }, 20_000);

  afterAll(async () => {
    if (app) {
      await app.close();
    }

    if (client) {
      await clearWorkspace(client);
      await client.end();
    }

    await new Promise<void>((resolve, reject) => {
      deepseekServer.close((error) => (error ? reject(error) : resolve()));
    });

    process.env.WORKER_TASK_QUEUE = previousWorkerTaskQueue;
    restoreEnv("DEEPSEEK_BASE_URL", previousDeepSeekBaseUrl);
  }, 30_000);

  it("runs only the remaining recommended teammates through the internal runtime path after plan approval", async () => {
    await worker.runUntil(async () => {
      const created = await createCodingWorkflow({
        authCookie,
        baseUrl,
        deadline: "今晚前给出演示版",
        goal: "把 landing page 演示拆成清晰的编码闭环",
        recommendedRoleIds: ["tech_lead", "software_engineer", "qa_tester"],
        repoContext: "apps/web landing page",
        workspaceId
      });

      const stream = await openStream({
        authCookie,
        baseUrl,
        conversationId: created.workflow.conversationId,
        workspaceId
      });

      try {
        await sendWorkflowDecision({
          authCookie,
          baseUrl,
          decision: "approved",
          workflowId: created.workflow.id,
          workspaceId
        });

        const events = await readEventsUntil(
          stream.reader,
          (event) =>
            event.kind === "conversation.status" &&
            event.payload.label === "coding.completed"
        );
        const workflow = await waitForWorkflow(baseUrl, created.workflow.conversationId, authCookie);
        const messages = await waitForMessages(
          baseUrl,
          created.workflow.conversationId,
          5,
          authCookie
        );

        expect(workflow.state).toBe("completed");
        expect(workflow.approvalState).toBe("approved");
        expect(workflow.runtimeBackend).toBe("enhanced-hermes");
        expect(workflow.taskSnapshot.every((task) => task.state === "done")).toBe(true);
        expect(workflow.approvalHistory).toEqual([
          expect.objectContaining({
            decision: "approved",
            planVersion: 1
          })
        ]);

        expect(messages.map((message) => message.sourceAgentId)).toEqual(
          expect.arrayContaining([
            null,
            workflow.planningTeammateId,
            workflow.engineerAgentId,
            workflow.qaAgentId
          ])
        );
        expect(messages).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              content: expect.stringContaining("软件工程师"),
              sourceAgentId: workflow.engineerAgentId
            }),
            expect.objectContaining({
              content: expect.stringContaining("测试工程师"),
              sourceAgentId: workflow.qaAgentId
            })
          ])
        );
        expect(messages).not.toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              sourceAgentId: workflow.reviewerAgentId
            })
          ])
        );

        expect(
          events
            .filter(
              (event): event is StreamEvent & { kind: "conversation.status" } =>
                event.kind === "conversation.status"
            )
            .map((event) => event.payload.label)
        ).toEqual(
          expect.arrayContaining([
            "coding.execution_started",
            "coding.qa_started",
            "coding.awaiting_user_confirmation",
            "coding.completed"
          ])
        );
        expect(
          events
            .filter(
              (event): event is StreamEvent & { kind: "conversation.status" } =>
                event.kind === "conversation.status"
            )
            .map((event) => event.payload.label)
        ).not.toContain("coding.review_started");
        expect(deepseekRequests).toHaveLength(2);

        const [activityRounds, approvals, memoryRecords, inboxItems] = await Promise.all([
          fetchJson<ActivityRound[]>(
            `${baseUrl}/activity?workflowId=${workflow.id}&workspaceId=${workspaceId}`,
            authCookie
          ),
          fetchJson<ApprovalRequest[]>(
            `${baseUrl}/approvals?channelId=${created.workflow.conversationId}&workspaceId=${workspaceId}`,
            authCookie
          ),
          fetchJson<MemoryRecord[]>(
            `${baseUrl}/memory?workspaceId=${workspaceId}`,
            authCookie
          ),
          fetchJson<InboxItem[]>(
            `${baseUrl}/inbox?workspaceId=${workspaceId}`,
            authCookie
          )
        ]);

        expect(activityRounds).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              actingTeammateId: "software_engineer",
              phase: "implementation",
              status: "succeeded"
            }),
            expect.objectContaining({
              actingTeammateId: "qa_tester",
              phase: "qa",
              status: "succeeded"
            })
          ])
        );
        expect(activityRounds).not.toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              actingTeammateId: "code_reviewer"
            })
          ])
        );
        expect(approvals).toEqual([
          expect.objectContaining({
            planVersion: 1,
            requesterTeammateId: "tech_lead",
            status: "approved"
          })
        ]);
        expect(memoryRecords).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              scope: "actor",
              source: "actor_self_memory",
              teammateId: "software_engineer"
            }),
            expect.objectContaining({
              scope: "actor",
              source: "actor_self_memory",
              teammateId: "qa_tester"
            }),
            expect.objectContaining({
              scope: "workspace",
              source: "workflow",
              title: "最近一次编码工作流总结"
            })
          ])
        );
        expect(inboxItems).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              kind: "approval_request",
              status: "resolved",
              workflowId: workflow.id
            }),
            expect.objectContaining({
              kind: "activity_update",
              teammateId: "software_engineer",
              workflowId: workflow.id
            })
          ])
        );
        expect(memoryRecords).not.toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              teammateId: "code_reviewer"
            })
          ])
        );
      } finally {
        await stream.reader.cancel();
      }
    });
  }, 20_000);
});

async function createCodingWorkflow(input: {
  authCookie: string;
  baseUrl: string;
  deadline: string;
  goal: string;
  recommendedRoleIds?: string[];
  repoContext: string;
  workspaceId: string;
}) {
  const response = await fetch(`${input.baseUrl}/coding-workflows`, {
    body: JSON.stringify({
      deadline: input.deadline,
      goal: input.goal,
      recommendedRoleIds: input.recommendedRoleIds,
      repoContext: input.repoContext,
      workspaceId: input.workspaceId
    }),
    headers: {
      "Content-Type": "application/json",
      cookie: input.authCookie
    },
    method: "POST"
  });

  expect(response.status).toBe(201);
  return (await response.json()) as {
    workflow: CodingWorkflowDetail;
  };
}

async function sendWorkflowDecision(input: {
  authCookie: string;
  baseUrl: string;
  decision: "approved" | "rejected" | "revision_requested";
  workflowId: string;
  workspaceId: string;
}) {
  const response = await fetch(`${input.baseUrl}/coding-workflows/${input.workflowId}/decisions`, {
    body: JSON.stringify({
      decision: input.decision,
      workspaceId: input.workspaceId
    }),
    headers: {
      "Content-Type": "application/json",
      cookie: input.authCookie
    },
    method: "POST"
  });

  expect(response.status).toBe(200);
}

async function waitForWorkflow(
  baseUrl: string,
  conversationId: string,
  authCookie: string
): Promise<CodingWorkflowDetail> {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const response = await fetch(
      `${baseUrl}/coding-workflows?conversationId=${conversationId}&workspaceId=${workspaceId}`,
      {
        headers: {
          cookie: authCookie
        }
      }
    );
    const payload = (await response.json()) as CodingWorkflowDetail | null;

    if (payload?.state === "completed") {
      return payload;
    }

    await new Promise((resolve) => {
      setTimeout(resolve, 50);
    });
  }

  throw new Error("Timed out waiting for the coding workflow to complete.");
}

async function openStream(input: {
  authCookie: string;
  baseUrl: string;
  conversationId: string;
  workspaceId: string;
}) {
  const response = await fetch(
    `${input.baseUrl}/streams/${input.conversationId}?workspaceId=${input.workspaceId}`,
    {
      headers: {
        Accept: "text/event-stream",
        cookie: input.authCookie
      }
    }
  );

  expect(response.status).toBe(200);
  const reader = response.body?.getReader();
  expect(reader).toBeDefined();
  expect(await readChunk(reader!)).toContain(": connected");

  return { reader: reader! };
}

async function readChunk(
  reader: ReadableStreamDefaultReader<Uint8Array>
): Promise<string> {
  const result = await reader.read();

  if (result.done || !result.value) {
    throw new Error("Expected SSE chunk but stream closed.");
  }

  return decoder.decode(result.value);
}

async function readEventsUntil(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  predicate: (event: StreamEvent) => boolean
): Promise<StreamEvent[]> {
  const events: StreamEvent[] = [];

  for (let attempt = 0; attempt < 80; attempt += 1) {
    const chunk = await readChunk(reader);
    const dataLines = chunk
      .split("\n")
      .filter((line) => line.startsWith("data: "));

    for (const line of dataLines) {
      const event = JSON.parse(line.slice("data: ".length)) as StreamEvent;
      events.push(event);

      if (predicate(event)) {
        return events;
      }
    }
  }

  throw new Error("Timed out waiting for the expected stream event.");
}

async function waitForMessages(
  baseUrl: string,
  conversationId: string,
  expectedCount: number,
  authCookie: string
): Promise<
  Array<{
    content: string;
    role: string;
    sourceAgentId: string | null;
  }>
> {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const response = await fetch(
      `${baseUrl}/messages?conversationId=${conversationId}&workspaceId=${workspaceId}`,
      {
        headers: {
          cookie: authCookie
        }
      }
    );
    const payload = (await response.json()) as Array<{
      content: string;
      role: string;
      sourceAgentId: string | null;
    }>;

    if (payload.length >= expectedCount) {
      return payload;
    }

    await new Promise((resolve) => {
      setTimeout(resolve, 50);
    });
  }

  throw new Error(`Timed out waiting for ${expectedCount} messages.`);
}

async function fetchJson<T>(url: string, authCookie: string): Promise<T> {
  const response = await fetch(url, {
    headers: {
      cookie: authCookie
    }
  });

  expect(response.status).toBe(200);
  return (await response.json()) as T;
}

async function seedCredential(client: Client, ownerUserId: string): Promise<void> {
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
      VALUES ($1, 'user_provided', $2, $3, $4, 'deepseek', $5, 'valid', $6)
    `,
    [
      randomUUID(),
      encryptCredentialSecret("sk-coding-workflow", encryptionKey),
      "coding-workflow-deepseek",
      ownerUserId,
      "deepseek-chat",
      workspaceId
    ]
  );
}

async function clearWorkspace(client: Client): Promise<void> {
  await client.query("DELETE FROM workspace_skill_bindings WHERE workspace_id = $1", [workspaceId]);
  await client.query("DELETE FROM memory_records WHERE workspace_id = $1", [workspaceId]);
  await client.query("DELETE FROM activity_round_steps WHERE round_id IN (SELECT id FROM activity_rounds WHERE workspace_id = $1)", [workspaceId]);
  await client.query("DELETE FROM activity_rounds WHERE workspace_id = $1", [workspaceId]);
  await client.query("DELETE FROM approval_requests WHERE workspace_id = $1", [workspaceId]);
  await client.query("DELETE FROM calendar_events WHERE workspace_id = $1", [workspaceId]);
  await client.query("DELETE FROM workspace_tasks WHERE workspace_id = $1", [workspaceId]);
  await client.query("DELETE FROM teammate_channel_memberships WHERE workspace_id = $1", [workspaceId]);
  await client.query("DELETE FROM coding_workflow_approvals WHERE workspace_id = $1", [workspaceId]);
  await client.query("DELETE FROM coding_workflows WHERE workspace_id = $1", [workspaceId]);
  await client.query("DELETE FROM artifacts WHERE workspace_id = $1", [workspaceId]);
  await client.query("DELETE FROM messages WHERE workspace_id = $1", [workspaceId]);
  await client.query("DELETE FROM conversation_agents WHERE workspace_id = $1", [workspaceId]);
  await client.query("DELETE FROM conversations WHERE workspace_id = $1", [workspaceId]);
  await client.query("DELETE FROM custom_agents WHERE workspace_id = $1", [workspaceId]);
  await client.query("DELETE FROM provider_credentials WHERE workspace_id = $1", [workspaceId]);
}

async function captureRequest(
  request: Parameters<typeof createServer>[0] extends (
    ...args: infer T
  ) => unknown
    ? T[0]
    : never,
  onEnd: (body: string) => Promise<void> | void
) {
  let body = "";
  request.on("data", (chunk) => {
    body += chunk.toString("utf8");
  });
  request.on("end", () => {
    void onEnd(body);
  });
}

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
    return;
  }

  process.env[name] = value;
}

function readPromptFromDeepSeekRequest(body: string): string {
  const payload = JSON.parse(body) as {
    messages?: Array<{ content?: string }>;
  };
  return payload.messages?.at(-1)?.content ?? "";
}

function resolveDeepSeekResponseForPrompt(prompt: string): string {
  if (prompt.includes("请以测试工程师身份")) {
    return "测试工程师：主路径通过，建议补一次视觉回归检查。";
  }

  if (prompt.includes("请以代码评审身份")) {
    return "代码评审：实现路径清晰，但还需要关注一处样式回归。";
  }

  if (prompt.includes("请以软件工程师身份")) {
    return "软件工程师：已按计划完成实现，并回写了主要改动和验证结果。";
  }

  throw new Error(`Unexpected prompt shape for local model runtime:\n${prompt}`);
}
