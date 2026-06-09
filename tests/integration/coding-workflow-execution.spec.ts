import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type {
  ActivityRound,
  ApprovalRequest,
  Artifact,
  CodingWorkflowDetail,
  InboxItem,
  MemoryRecord,
  StreamEvent
} from "@agenthub/contracts";
import { encryptCredentialSecret } from "../../packages/domain/src/index.ts";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { Client } from "pg";

import { createApp } from "../../apps/api/src/main.js";
import { bootstrapWorker } from "../../apps/worker/src/main.js";
import { signupSessionViaFetch } from "../support/auth-session.js";

const decoder = new TextDecoder();
const workspaceId = "workspace_coding_workflow_execution";
const workerTaskQueue = `worker-task-coding-workflow-execution-${Date.now()}`;
const encryptionKey =
  process.env.CREDENTIAL_ENCRYPTION_KEY ?? "agenthub-dev-credential-key";
const deepseekRequests: string[] = [];
let forceMissingWebpageArtifact = false;
let forceRepeatedRepairBlock = false;

describe("coding workflow execution integration", () => {
  let app: NestFastifyApplication;
  let authCookie: string;
  let baseUrl: string;
  let client: Client;
  let deepseekServer: Server;
  let ownerUserId: string;
  let previousDeepSeekBaseUrl: string | undefined;
  let previousWorkerTaskQueue: string | undefined;

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
  }, 30_000);

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

  it("runs the four-role coding workflow and returns the final tech-lead summary after plan approval", async () => {
    deepseekRequests.length = 0;
    forceMissingWebpageArtifact = false;
    forceRepeatedRepairBlock = false;

    await runWithWorker(async () => {
      const created = await createCodingWorkflow({
        authCookie,
        baseUrl,
        deadline: "今晚前给出演示版",
        goal: "把 landing page 演示拆成清晰的编码闭环",
        recommendedRoleIds: [
          "tech_lead",
          "software_engineer",
          "code_reviewer",
          "qa_tester"
        ],
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
          9,
          authCookie
        );
        const finalSummaryMessage = messages
          .filter(
            (message) =>
              message.sourceAgentId === workflow.planningTeammateId &&
              message.content.includes("原始想法完成度")
          )
          .at(-1);
        expect(finalSummaryMessage).toBeDefined();

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
            workflow.reviewerAgentId,
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
              content: expect.stringContaining("代码评审工程师"),
              sourceAgentId: workflow.reviewerAgentId
            }),
            expect.objectContaining({
              content: expect.stringContaining("质量保障测试工程师"),
              sourceAgentId: workflow.qaAgentId
            }),
            expect.objectContaining({
              content: expect.stringContaining("原始想法完成度：90%"),
              sourceAgentId: workflow.planningTeammateId
            })
          ])
        );
        expect(messages[0]).toEqual(expect.objectContaining({ role: "user" }));
        expect(messages[1]).toEqual(
          expect.objectContaining({ sourceAgentId: workflow.planningTeammateId })
        );

        const statusLabels = events
          .filter(
            (event): event is StreamEvent & { kind: "conversation.status" } =>
              event.kind === "conversation.status"
          )
          .map((event) => event.payload.label);
        expect(statusLabels).toEqual(
          expect.arrayContaining([
            "coding.execution_started",
            "coding.review_started",
            "coding.qa_started",
            "coding.summary_started",
            "coding.completed"
          ])
        );
        expect(statusLabels).not.toContain("coding.awaiting_user_confirmation");
        expect(deepseekRequests).toHaveLength(6);

        const [activityRounds, approvals, memoryRecords, inboxItems, artifacts, artifactRows] = await Promise.all([
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
          ),
          fetchJson<Artifact[]>(
            `${baseUrl}/artifacts?messageId=${finalSummaryMessage!.id}&workspaceId=${workspaceId}`,
            authCookie
          ),
          client.query<{
            message_id: string;
            mime_type: string;
            title: string;
          }>(
            `
              SELECT message_id, mime_type, title
              FROM artifacts
              WHERE workspace_id = $1
              ORDER BY created_at ASC, id ASC
            `,
            [workspaceId]
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
              actingTeammateId: "code_reviewer",
              phase: "review",
              status: "succeeded"
            }),
            expect.objectContaining({
              actingTeammateId: "qa_tester",
              phase: "qa",
              status: "succeeded"
            }),
            expect.objectContaining({
              actingTeammateId: "tech_lead",
              phase: "coordination",
              status: "succeeded"
            })
          ])
        );
        expect(activityRounds.filter((round) => round.status === "running")).toEqual([]);
        expect(
          activityRounds.filter(
            (round) =>
              round.actingTeammateId === "software_engineer" &&
              round.phase === "implementation"
          )
        ).toHaveLength(2);
        expect(
          activityRounds.filter(
            (round) =>
              round.actingTeammateId === "code_reviewer" && round.phase === "review"
          )
        ).toHaveLength(2);
        expect(artifactRows.rows).toEqual(expect.arrayContaining([
          expect.objectContaining({
            mime_type: "text/html",
            title: "Landing page demo"
          }),
          expect.objectContaining({
            message_id: finalSummaryMessage!.id,
            mime_type: "text/markdown",
            title: "编码工作流验收报告"
          })
        ]));
        expect(artifacts).toEqual([
          expect.objectContaining({
            messageId: finalSummaryMessage!.id,
            mimeType: "text/markdown",
            title: "编码工作流验收报告"
          })
        ]);
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
              teammateId: "code_reviewer"
            }),
            expect.objectContaining({
              scope: "actor",
              source: "actor_self_memory",
              teammateId: "qa_tester"
            }),
            expect.objectContaining({
              scope: "actor",
              source: "actor_self_memory",
              teammateId: "tech_lead"
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
      } finally {
        await stream.reader.cancel();
      }
    });
  }, 60_000);

  it("falls back to a persisted HTML artifact when the engineer claims tool use without an envelope", async () => {
    deepseekRequests.length = 0;
    forceMissingWebpageArtifact = true;
    forceRepeatedRepairBlock = false;

    await runWithWorker(async () => {
      const created = await createCodingWorkflow({
        authCookie,
        baseUrl,
        deadline: "今天内给出演示级网页",
        goal: "回归测试 2026-06-07：请创建一个有关变形金刚真人电影的沉浸式网页，包含首屏、电影时间线、主要角色/阵营、影片卡片、关键看点和移动端响应式布局，并生成真实可预览的 HTML 网页 artifact。",
        recommendedRoleIds: [
          "tech_lead",
          "software_engineer",
          "code_reviewer",
          "qa_tester"
        ],
        repoContext: "对话式创建网页验收",
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
          7,
          authCookie
        );
        const channelArtifacts = await fetchJson<Artifact[]>(
          `${baseUrl}/artifacts?conversationId=${created.workflow.conversationId}&workspaceId=${workspaceId}`,
          authCookie
        );
        const activityRounds = await fetchJson<ActivityRound[]>(
          `${baseUrl}/activity?workflowId=${workflow.id}&workspaceId=${workspaceId}`,
          authCookie
        );
        const htmlArtifact = channelArtifacts.find((artifact) => artifact.mimeType === "text/html");
        const completedStreamMessageIds = events
          .filter(
            (event): event is StreamEvent & { kind: "conversation.message.completed" } =>
              event.kind === "conversation.message.completed"
          )
          .map((event) => event.payload.messageId);
        const persistedMessageIds = new Set(messages.map((message) => message.id));

        expect(workflow.state).toBe("completed");
        expect(workflow.taskSnapshot).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              ownerRole: "software_engineer",
              state: "done"
            }),
            expect.objectContaining({
              ownerRole: "code_reviewer",
              state: "done"
            }),
            expect.objectContaining({
              ownerRole: "qa_tester",
              state: "done"
            }),
            expect.objectContaining({
              ownerRole: "tech_lead",
              state: "done"
            })
          ])
        );
        expect(htmlArtifact).toEqual(
          expect.objectContaining({
            kind: "preview",
            mimeType: "text/html",
            storageKey: expect.any(String),
            title: expect.stringContaining("变形金刚")
          })
        );
        expect(messages.map((message) => message.sourceAgentId)).toEqual(
          expect.arrayContaining([
            workflow.engineerAgentId,
            workflow.reviewerAgentId,
            workflow.qaAgentId,
            workflow.planningTeammateId
          ])
        );
        expect(completedStreamMessageIds.length).toBeGreaterThan(0);
        expect(completedStreamMessageIds.every((messageId) => persistedMessageIds.has(messageId))).toBe(true);
        expect(activityRounds).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              actingTeammateId: "software_engineer",
              phase: "implementation",
              status: "succeeded"
            }),
            expect.objectContaining({
              actingTeammateId: "code_reviewer",
              phase: "review",
              status: "succeeded"
            }),
            expect.objectContaining({
              actingTeammateId: "qa_tester",
              phase: "qa",
              status: "succeeded"
            }),
            expect.objectContaining({
              actingTeammateId: "tech_lead",
              phase: "coordination",
              status: "succeeded"
            })
          ])
        );
        expect(
          activityRounds.filter(
            (round) =>
              round.actingTeammateId === "software_engineer" &&
              round.phase === "implementation" &&
              round.status === "failed"
          )
        ).toEqual([]);
        expect(
          activityRounds.filter(
            (round) =>
              round.actingTeammateId === "software_engineer" &&
              round.phase === "implementation" &&
              round.status === "succeeded"
          )
        ).toHaveLength(1);
        expect(
          deepseekRequests
            .map(readPromptFromDeepSeekRequest)
            .filter((prompt) => prompt.includes("请以软件工程师身份"))
        ).toHaveLength(1);
        expect(
          deepseekRequests
            .map(readPromptFromDeepSeekRequest)
            .filter((prompt) => prompt.includes("请以质量保障测试工程师身份"))
        ).toHaveLength(1);
        expect(messages.map((message) => message.content).join("\n")).not.toMatch(
          /artifact\.webpage\.create|隐藏的工作流|tool_plan|envelope/
        );
      } finally {
        await stream.reader.cancel();
        forceMissingWebpageArtifact = false;
      }
    });
  }, 60_000);

  it("runs QA blocked-confirmation and fails when repeated engineer repairs do not change the HTML", async () => {
    deepseekRequests.length = 0;
    forceRepeatedRepairBlock = true;

    await runWithWorker(async () => {
      const created = await createCodingWorkflow({
        authCookie,
        baseUrl,
        deadline: "今天内给出可验收版本",
        goal: "请创建一个有关变形金刚真人电影的网页，必须包含首屏、时间线、角色阵营、影片卡片和响应式布局。",
        recommendedRoleIds: [
          "tech_lead",
          "software_engineer",
          "code_reviewer",
          "qa_tester"
        ],
        repoContext: "返修质量回归测试",
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

        await readEventsUntil(
          stream.reader,
          (event) =>
            event.kind === "conversation.status" &&
            event.payload.label === "coding.execution_failed"
        );
        const workflow = await waitForWorkflow(
          baseUrl,
          created.workflow.conversationId,
          authCookie,
          "execution_failed"
        );
        const messages = await waitForMessages(
          baseUrl,
          created.workflow.conversationId,
          8,
          authCookie
        );
        const activityRounds = await fetchJson<ActivityRound[]>(
          `${baseUrl}/activity?workflowId=${workflow.id}&workspaceId=${workspaceId}`,
          authCookie
        );
        const prompts = deepseekRequests.map(readPromptFromDeepSeekRequest);

        expect(workflow.state).toBe("execution_failed");
        expect(messages).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              content: expect.stringContaining("阻塞风险确认"),
              sourceAgentId: workflow.qaAgentId
            }),
            expect.objectContaining({
              content: expect.stringContaining("返修无实质变化"),
              sourceAgentId: workflow.planningTeammateId
            })
          ])
        );
        expect(activityRounds).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              actingTeammateId: "qa_tester",
              phase: "qa",
              status: "succeeded"
            }),
            expect.objectContaining({
              actingTeammateId: "tech_lead",
              phase: "coordination",
              status: "failed"
            })
          ])
        );
        expect(
          prompts.filter(
            (prompt) =>
              prompt.includes("请以质量保障测试工程师身份") &&
              prompt.includes("阻塞风险确认")
          )
        ).toHaveLength(1);
        expect(
          prompts.filter(
            (prompt) =>
              prompt.includes("请以软件工程师身份") &&
              prompt.includes("返修产物与上一版无实质差异")
          )
        ).toHaveLength(1);
      } finally {
        await stream.reader.cancel();
        forceRepeatedRepairBlock = false;
      }
    });
  }, 60_000);
});

async function runWithWorker<T>(callback: () => Promise<T>): Promise<T> {
  const worker = await bootstrapWorker();
  return worker.runUntil(callback);
}

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
  authCookie: string,
  expectedState: CodingWorkflowDetail["state"] = "completed"
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

    if (payload?.state === expectedState) {
      return payload;
    }

    await new Promise((resolve) => {
      setTimeout(resolve, 50);
    });
  }

  throw new Error(`Timed out waiting for the coding workflow to reach ${expectedState}.`);
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
    id: string;
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
      id: string;
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
  const matchingPromptCount = (needle: string) =>
    deepseekRequests
      .map(readPromptFromDeepSeekRequest)
      .filter((entry) => entry.includes(needle)).length;

  if (prompt.includes("请以技术负责人身份向用户做最终汇报")) {
    if (forceRepeatedRepairBlock) {
      return [
        "技术负责人：原始想法完成度：45%（未完成）。",
        "",
        "## 完成项",
        "- 已完成首版网页产物和多轮返修尝试。",
        "- 已触发代码评审与 QA 阻塞风险确认。",
        "",
        "## 未完成项",
        "- 代码评审指出的问题仍未解决。",
        "- 返修无实质变化，不能进入完整 QA 验收。",
        "",
        "## 阻塞项/风险",
        "- 返修无实质变化，首屏主视觉层级仍不清晰。",
        "",
        "## 下一步",
        "- 需要软件工程师基于评审意见重新设计 HTML 结构与样式。"
      ].join("\n");
    }

    return [
      "技术负责人：原始想法完成度：90%（部分完成）。",
      "",
      "## 完成项",
      "- 已完成实现、评审返修、QA 验证和风险汇总。",
      "",
      "## 未完成项",
      "- 仍需补录演示视频。",
      "",
      "## 阻塞项/风险",
      "- 暂无高严重度阻塞。",
      "",
      "## 下一步",
      "- 进入真实设备验收。"
    ].join("\n");
  }

  if (prompt.includes("请以质量保障测试工程师身份")) {
    if (forceRepeatedRepairBlock || prompt.includes("阻塞风险确认")) {
      return [
        "质量保障测试工程师：阻塞风险确认。",
        "代码评审仍未通过，因此本轮不做完整验收。",
        "确认风险：首屏主视觉层级仍不清晰，返修版本没有体现评审反馈。",
        "结论：BLOCKED",
        "阻塞项：代码评审阻塞未解除，返修无实质变化"
      ].join("\n");
    }

    return "质量保障测试工程师：主路径通过，建议补一次视觉回归检查。\n结论：PASS\n阻塞项：无";
  }

  if (prompt.includes("请以代码评审工程师身份")) {
    if (forceRepeatedRepairBlock) {
      return [
        "代码评审工程师：Request Changes。",
        "高严重度：首屏主视觉层级仍不清晰，无法快速识别主题。",
        "结论：REQUEST_CHANGES",
        "阻塞项：首屏主视觉层级仍不清晰"
      ].join("\n");
    }

    if (forceMissingWebpageArtifact) {
      return "代码评审工程师：网页 artifact 已真实落库，内容覆盖首屏、时间线、角色阵营、影片卡片和响应式布局。未发现高严重度风险，也没有阻塞项。建议进入 QA 验收。";
    }

    if (matchingPromptCount("请以代码评审工程师身份") === 1) {
      return "代码评审工程师：Request Changes。高严重度：Markdown artifact 未真实落库。\n结论：REQUEST_CHANGES\n阻塞项：Markdown artifact 未真实落库";
    }

    return "代码评审工程师：返修后通过，artifact 落库路径和最终汇报格式都有验证。\n结论：PASS\n阻塞项：无";
  }

  if (prompt.includes("请以软件工程师身份")) {
    if (forceRepeatedRepairBlock) {
      return JSON.stringify({
        intents: [
          {
            calls: [
              {
                idempotencyKey: `artifact:repeated-transformers-${matchingPromptCount("请以软件工程师身份")}`,
                input: {
                  fileName: "transformers-page.html",
                  html: buildLandingPageHtml("重复版 transformers page"),
                  title: "Transformers repeated page"
                },
                inputSchemaVersion: "1",
                toolName: "artifact.webpage.create"
              }
            ],
            riskLevel: "low",
            summary: "Create repeated transformers HTML.",
            type: "tool_plan"
          }
        ],
        visibleMessage: "软件工程师：已按评审意见完成返修，并重新提交 HTML 产物。"
      });
    }

    if (forceMissingWebpageArtifact) {
      return [
        "我来实现这份计划，产出可预览的变形金刚真人电影沉浸式网页。",
        "",
        "已在隐藏的工作流中调用 artifact.webpage.create，输出完整单文件 HTML。",
        "",
        "HTML 已合并内联 CSS 与少量内联 JS，无需外部资源，可直接在 iframe 中预览。"
      ].join("\n");
    }

    if (matchingPromptCount("请以软件工程师身份") > 1) {
      return JSON.stringify({
        intents: [
          {
            calls: [
              {
                idempotencyKey: "artifact:landing-page-demo-repair",
                input: {
                  fileName: "landing-page-demo.html",
                  html: buildLandingPageHtml("返修版 landing page"),
                  title: "Landing page demo"
                },
                inputSchemaVersion: "1",
                toolName: "artifact.webpage.create"
              }
            ],
            riskLevel: "low",
            summary: "Create repaired landing page HTML.",
            type: "tool_plan"
          }
        ],
        visibleMessage: "软件工程师：已完成返修，补上真实 HTML 网页产物、artifact 持久化和百分比汇报兜底。"
      });
    }

    return JSON.stringify({
      intents: [
        {
          calls: [
            {
              idempotencyKey: "artifact:landing-page-demo",
              input: {
                fileName: "landing-page-demo.html",
                html: buildLandingPageHtml("首版 landing page"),
                title: "Landing page demo"
              },
              inputSchemaVersion: "1",
              toolName: "artifact.webpage.create"
            }
          ],
          riskLevel: "low",
          summary: "Create landing page HTML.",
          type: "tool_plan"
        }
      ],
      visibleMessage: "软件工程师：已按计划完成实现，并生成真实 HTML 网页产物。"
    });
  }

  throw new Error(`Unexpected prompt shape for local model runtime:\n${prompt}`);
}

function buildLandingPageHtml(heading: string): string {
  return [
    "<!doctype html>",
    '<html lang="zh-CN">',
    "<head>",
    '<meta charset="utf-8" />',
    '<meta name="viewport" content="width=device-width, initial-scale=1" />',
    `<title>${heading}</title>`,
    "<style>",
    "body{margin:0;font-family:Inter,Arial,sans-serif;background:#101820;color:#f7fafc}",
    ".hero{min-height:60vh;padding:48px;display:grid;place-items:center;background:#19324a}",
    ".grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:16px;padding:24px}",
    ".card{border:1px solid #486581;border-radius:8px;padding:16px;background:#243b53}",
    "</style>",
    "</head>",
    "<body>",
    `<section class="hero"><h1>${heading}</h1></section>`,
    '<section class="grid"><article class="card">首屏</article><article class="card">时间线</article><article class="card">角色阵营</article><article class="card">影片卡片</article></section>',
    "</body>",
    "</html>"
  ].join("");
}
