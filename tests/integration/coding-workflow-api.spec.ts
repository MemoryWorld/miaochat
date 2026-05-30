import { randomUUID } from "node:crypto";

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import type {
  CodingWorkflowDetail,
  Conversation,
  Message
} from "@agenthub/contracts";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { Client } from "pg";

import { createApp } from "../../apps/api/src/main.js";
import { encryptCredentialSecret } from "../../packages/domain/src/index.ts";
import { signupSessionViaInject } from "../support/auth-session.js";

const workspaceId = "workspace_coding_workflow_api";
const encryptionKey =
  process.env.CREDENTIAL_ENCRYPTION_KEY ?? "agenthub-dev-credential-key";

describe("coding workflow API", () => {
  let app: NestFastifyApplication;
  let authCookie: string;
  let client: Client;
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
      displayName: "Coding Workflow API",
      email: `coding-workflow-api-${Date.now()}@example.com`
    });
    authCookie = session.cookie;
    ownerUserId = session.user.id;

    await seedCredential(client, {
      ownerUserId,
      provider: "deepseek",
      workspaceId
    });
  });

  afterEach(async () => {
    await clearWorkspace(client);
    await seedCredential(client, {
      ownerUserId,
      provider: "deepseek",
      workspaceId
    });
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }

    if (client) {
      await clearWorkspace(client);
      await client.end();
    }
  });

  it("creates a coding workflow, persists the first tech-lead plan, and supports revise/reject decisions", async () => {
    const createResponse = await app.inject({
      headers: {
        cookie: authCookie
      },
      method: "POST",
      payload: {
        deadline: "今天 18:00",
        goal: "把落地页演示拆成计划、实现、评审和测试四段",
        priority: "high",
        recommendedRoleIds: ["tech_lead", "software_engineer", "qa_tester"],
        repoContext: "apps/web 落地页与演示入口",
        workspaceId
      },
      url: "/coding-workflows"
    });

    expect(createResponse.statusCode).toBe(201);
    const created = createResponse.json() as {
      conversation: Conversation;
      workflow: CodingWorkflowDetail;
    };

    expect(created.conversation.mode).toBe("group");
    expect(created.conversation.title).toContain("编码工作流");
    expect(created.workflow.state).toBe("plan_pending_approval");
    expect(created.workflow.approvalState).toBe("pending");
    expect(created.workflow.activePlanVersion).toBe(1);
    expect(created.workflow.runtimeBackend).toBe("enhanced-hermes");
    expect(created.workflow.priority).toBe("high");
    expect(created.workflow.planningRole).toBe("tech_lead");
    expect(created.workflow.taskSnapshot).toEqual([
      expect.objectContaining({
        id: "plan",
        state: "in_review"
      }),
      expect.objectContaining({
        id: "execution:software_engineer",
        state: "todo"
      }),
      expect.objectContaining({
        id: "execution:qa_tester",
        state: "todo"
      })
    ]);
    expect(created.workflow.teammates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          isBuiltIn: true,
          name: "技术负责人",
          role: "tech_lead",
          runtimeBackend: "enhanced-hermes"
        }),
        expect.objectContaining({
          isBuiltIn: true,
          name: "软件工程师",
          role: "software_engineer"
        }),
        expect.objectContaining({
          isBuiltIn: true,
          name: "测试工程师",
          role: "qa_tester"
        })
      ])
    );
    expect(created.workflow.teammates).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "代码评审"
        })
      ])
    );
    expect(created.workflow.executionStageAssignments).toEqual([
      expect.objectContaining({
        role: "software_engineer"
      }),
      expect.objectContaining({
        role: "qa_tester"
      })
    ]);

    const messagesResponse = await app.inject({
      headers: {
        cookie: authCookie
      },
      method: "GET",
      url: `/messages?conversationId=${created.conversation.id}&workspaceId=${workspaceId}`
    });

    expect(messagesResponse.statusCode).toBe(200);
    const initialMessages = messagesResponse.json() as Message[];
    expect(initialMessages).toHaveLength(2);
    expect(initialMessages[0]?.role).toBe("user");
    expect(initialMessages[1]).toEqual(
      expect.objectContaining({
        id: created.workflow.planMessageId,
        role: "assistant",
        sourceAgentId: created.workflow.planningTeammateId
      })
    );
    expect(initialMessages[1]?.content).toContain("技术负责人 计划建议");
    expect(initialMessages[1]?.content).not.toContain("代码评审检查风险");
    expect(initialMessages[1]?.content).toContain("如果计划没有问题");

    const getResponse = await app.inject({
      headers: {
        cookie: authCookie
      },
      method: "GET",
      url: `/coding-workflows?conversationId=${created.conversation.id}&workspaceId=${workspaceId}`
    });

    expect(getResponse.statusCode).toBe(200);
    expect(getResponse.json()).toEqual(
      expect.objectContaining({
        approvalState: "pending",
        id: created.workflow.id,
        state: "plan_pending_approval"
      })
    );

    const reviseResponse = await app.inject({
      headers: {
        cookie: authCookie
      },
      method: "POST",
      payload: {
        decision: "revision_requested",
        note: "把回归验证和关键风险写得更具体一些。",
        workspaceId
      },
      url: `/coding-workflows/${created.workflow.id}/decisions`
    });

    expect(reviseResponse.statusCode).toBe(200);
    const revised = reviseResponse.json() as CodingWorkflowDetail;
    expect(revised.activePlanVersion).toBe(2);
    expect(revised.approvalState).toBe("pending");
    expect(revised.state).toBe("plan_pending_approval");
    expect(revised.approvalHistory).toEqual([
      expect.objectContaining({
        decision: "revision_requested",
        note: "把回归验证和关键风险写得更具体一些。",
        planVersion: 1
      })
    ]);

    const revisedMessagesResponse = await app.inject({
      headers: {
        cookie: authCookie
      },
      method: "GET",
      url: `/messages?conversationId=${created.conversation.id}&workspaceId=${workspaceId}`
    });

    const revisedMessages = revisedMessagesResponse.json() as Message[];
    const revisedPlanMessage = revisedMessages.find(
      (message) => message.id === revised.planMessageId
    );

    expect(revisedMessages.filter((message) => message.role === "assistant")).toHaveLength(2);
    expect(revisedPlanMessage?.content).toContain("根据用户反馈调整");
    expect(revisedPlanMessage?.content).toContain("把回归验证和关键风险写得更具体一些。");

    const rejectResponse = await app.inject({
      headers: {
        cookie: authCookie
      },
      method: "POST",
      payload: {
        decision: "rejected",
        note: "先暂停这个方向，等需求进一步收敛。",
        workspaceId
      },
      url: `/coding-workflows/${created.workflow.id}/decisions`
    });

    expect(rejectResponse.statusCode).toBe(200);
    expect(rejectResponse.json()).toEqual(
      expect.objectContaining({
        approvalHistory: [
          expect.objectContaining({
            decision: "revision_requested"
          }),
          expect.objectContaining({
            decision: "rejected",
            note: "先暂停这个方向，等需求进一步收敛。"
          })
        ],
        approvalState: "rejected",
        state: "plan_rejected"
      })
    );
  });

  it("rejects recommended teammate sets that cannot enter implementation", async () => {
    const response = await app.inject({
      headers: {
        cookie: authCookie
      },
      method: "POST",
      payload: {
        goal: "只保留评审和测试角色",
        recommendedRoleIds: ["code_reviewer", "qa_tester"],
        workspaceId
      },
      url: "/coding-workflows"
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual(
      expect.objectContaining({
        message: "至少要保留 1 位能够进入实现阶段的 AI 同事。"
      })
    );
  });
});

async function clearWorkspace(client: Client): Promise<void> {
  await client.query("DELETE FROM workspace_skill_bindings WHERE workspace_id = $1", [
    workspaceId
  ]);
  await client.query("DELETE FROM memory_records WHERE workspace_id = $1", [workspaceId]);
  await client.query(
    "DELETE FROM activity_round_steps WHERE round_id IN (SELECT id FROM activity_rounds WHERE workspace_id = $1)",
    [workspaceId]
  );
  await client.query("DELETE FROM activity_rounds WHERE workspace_id = $1", [workspaceId]);
  await client.query("DELETE FROM approval_requests WHERE workspace_id = $1", [workspaceId]);
  await client.query("DELETE FROM calendar_events WHERE workspace_id = $1", [workspaceId]);
  await client.query("DELETE FROM workspace_tasks WHERE workspace_id = $1", [workspaceId]);
  await client.query("DELETE FROM teammate_channel_memberships WHERE workspace_id = $1", [
    workspaceId
  ]);
  await client.query("DELETE FROM coding_workflow_approvals WHERE workspace_id = $1", [
    workspaceId
  ]);
  await client.query("DELETE FROM coding_workflows WHERE workspace_id = $1", [workspaceId]);
  await client.query("DELETE FROM artifacts WHERE workspace_id = $1", [workspaceId]);
  await client.query("DELETE FROM messages WHERE workspace_id = $1", [workspaceId]);
  await client.query("DELETE FROM conversation_agents WHERE workspace_id = $1", [workspaceId]);
  await client.query("DELETE FROM conversations WHERE workspace_id = $1", [workspaceId]);
  await client.query("DELETE FROM custom_agents WHERE workspace_id = $1", [workspaceId]);
  await client.query("DELETE FROM provider_credentials WHERE workspace_id = $1", [workspaceId]);
}

async function seedCredential(
  client: Client,
  input: {
    ownerUserId: string;
    provider: "deepseek" | "hermes" | "openclaw";
    workspaceId: string;
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
      VALUES ($1, 'user_provided', $2, $3, $4, $5, $6, 'valid', $7)
    `,
    [
      randomUUID(),
      encryptCredentialSecret(`${input.provider}_secret_api`, encryptionKey),
      `${input.provider}-coding-workflow`,
      input.ownerUserId,
      input.provider,
      `acct_${input.provider}_coding_workflow`,
      input.workspaceId
    ]
  );
}
