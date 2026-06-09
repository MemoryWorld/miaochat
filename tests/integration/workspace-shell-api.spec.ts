import { randomUUID } from "node:crypto";

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import type {
  ActivityRound,
  ActorProfile,
  ApprovalRequest,
  BillingPlanSummary,
  CalendarEvent,
  CapabilityManagementEntry,
  ChannelSummary,
  CodingWorkflowDetail,
  Conversation,
  CustomAgent,
  FileSurfaceEntry,
  InboxItem,
  MemoryRecord,
  SkillBinding,
  WorkspaceMemberDirectoryEntry,
  WorkspaceTask
} from "@agenthub/contracts";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { Client } from "pg";

import { createApp } from "../../apps/api/src/main.js";
import { encryptCredentialSecret } from "../../packages/domain/src/index.ts";
import { signupSessionViaInject } from "../support/auth-session.js";

const workspaceId = "workspace_shell_phase_d";
const encryptionKey =
  process.env.CREDENTIAL_ENCRYPTION_KEY ?? "agenthub-dev-credential-key";

describe("workspace shell API", () => {
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
      displayName: "Workspace Shell",
      email: `workspace-shell-${Date.now()}@example.com`
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

  it("projects workflow-owned data into Phase D shell surfaces", async () => {
    const created = await createCodingWorkflow(app, authCookie);
    await seedArtifact(client, {
      messageId: created.workflow.planMessageId!,
      title: "计划附件",
      workspaceId
    });

    const memoryCreateResponse = await app.inject({
      headers: {
        cookie: authCookie
      },
      method: "POST",
      payload: {
        content: "技术负责人需要持续强调范围边界。",
        conversationId: created.conversation.id,
        scope: "actor",
        source: "manual",
        teammateId: "tech_lead",
        title: "计划边界提示",
        workspaceId
      },
      url: "/memory"
    });

    expect(memoryCreateResponse.statusCode).toBe(201);
    const createdMemory = memoryCreateResponse.json() as MemoryRecord;
    expect(createdMemory.teammateId).toBe("tech_lead");

    const [
      channels,
      channelFiles,
      actorFiles,
      inbox,
      workflowTasks,
      techLeadTasks,
      calendar,
      activity,
      approvals,
      memory,
      skills,
      memberDirectory,
      billing,
      capabilities,
      actorProfile
    ] = await Promise.all([
      getJson<ChannelSummary[]>(
        app,
        authCookie,
        `/channels?workspaceId=${workspaceId}`
      ),
      getJson<FileSurfaceEntry[]>(
        app,
        authCookie,
        `/channel-files?channelId=${created.conversation.id}&workspaceId=${workspaceId}`
      ),
      getJson<FileSurfaceEntry[]>(
        app,
        authCookie,
        `/actor-files?teammateId=tech_lead&workspaceId=${workspaceId}`
      ),
      getJson<InboxItem[]>(app, authCookie, `/inbox?workspaceId=${workspaceId}`),
      getJson<WorkspaceTask[]>(
        app,
        authCookie,
        `/tasks?workflowId=${created.workflow.id}&workspaceId=${workspaceId}`
      ),
      getJson<WorkspaceTask[]>(
        app,
        authCookie,
        `/tasks?teammateId=tech_lead&workspaceId=${workspaceId}`
      ),
      getJson<CalendarEvent[]>(
        app,
        authCookie,
        `/calendar?channelId=${created.conversation.id}&workspaceId=${workspaceId}`
      ),
      getJson<ActivityRound[]>(
        app,
        authCookie,
        `/activity?workflowId=${created.workflow.id}&workspaceId=${workspaceId}`
      ),
      getJson<ApprovalRequest[]>(
        app,
        authCookie,
        `/approvals?channelId=${created.conversation.id}&workspaceId=${workspaceId}`
      ),
      getJson<MemoryRecord[]>(
        app,
        authCookie,
        `/memory?teammateId=tech_lead&workspaceId=${workspaceId}`
      ),
      getJson<SkillBinding[]>(
        app,
        authCookie,
        `/skills?teammateId=tech_lead&workspaceId=${workspaceId}`
      ),
      getJson<WorkspaceMemberDirectoryEntry[]>(
        app,
        authCookie,
        `/workspace-member-directory?workspaceId=${workspaceId}`
      ),
      getJson<BillingPlanSummary>(
        app,
        authCookie,
        `/workspace-billing-summary?workspaceId=${workspaceId}`
      ),
      getJson<CapabilityManagementEntry[]>(
        app,
        authCookie,
        `/workspace-capabilities?workspaceId=${workspaceId}`
      ),
      getJson<ActorProfile>(
        app,
        authCookie,
        `/actor-profile?teammateId=tech_lead&workspaceId=${workspaceId}`
      )
    ]);

    expect(channels).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: created.conversation.id,
          memberTeammateIds: expect.arrayContaining([
            "tech_lead",
            "software_engineer",
            "code_reviewer",
            "qa_tester"
          ]),
          title: created.conversation.title
        })
      ])
    );
    expect(channelFiles).toEqual([
      expect.objectContaining({
        messageId: created.workflow.planMessageId,
        storageKey: null,
        title: "计划附件"
      })
    ]);
    expect(actorFiles).toEqual([
      expect.objectContaining({
        messageId: created.workflow.planMessageId,
        storageKey: null,
        title: "计划附件"
      })
    ]);
    expect(inbox).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "approval_request",
          status: "action_required",
          workflowId: created.workflow.id
        }),
        expect.objectContaining({
          kind: "workflow_update",
          workflowId: created.workflow.id
        })
      ])
    );
    expect(workflowTasks).toHaveLength(created.workflow.taskSnapshot.length);
    expect(workflowTasks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          teammateId: "tech_lead",
          title: "技术负责人汇总完成度"
        })
      ])
    );
    expect(techLeadTasks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          teammateId: "tech_lead",
          title: "技术负责人提交计划"
        }),
        expect.objectContaining({
          teammateId: "tech_lead",
          title: "技术负责人汇总完成度"
        })
      ])
    );
    expect(calendar).toEqual([
      expect.objectContaining({
        channelId: created.conversation.id,
        title: expect.stringContaining("编码工作流"),
        workflowId: created.workflow.id
      })
    ]);
    expect(activity).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actingTeammateId: "tech_lead",
          phase: "planning",
          workflowId: created.workflow.id
        })
      ])
    );
    expect(approvals).toEqual([
      expect.objectContaining({
        requesterTeammateId: "tech_lead",
        status: "pending",
        workflowId: created.workflow.id
      })
    ]);
    expect(memory).toEqual([
      expect.objectContaining({
        id: createdMemory.id,
        teammateId: "tech_lead",
        title: "计划边界提示"
      })
    ]);
    expect(skills).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "planning-and-approval",
          teammateIds: expect.arrayContaining(["tech_lead"])
        }),
        expect.objectContaining({
          id: "memory-sync",
          teammateIds: expect.arrayContaining(["tech_lead"])
        })
      ])
    );
    expect(memberDirectory).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          displayName: "Workspace Shell",
          principalKind: "human"
        }),
        expect.objectContaining({
          displayName: "技术负责人",
          principalKind: "ai_teammate",
          teammateId: "tech_lead"
        })
      ])
    );
    expect(actorProfile).toEqual(
      expect.objectContaining({
        builtInRole: "tech_lead",
        executionPlane: "in_process",
        id: "tech_lead",
        kind: "builtin",
        runtimeBackend: "enhanced-hermes"
      })
    );
    expect(billing).toEqual(
      expect.objectContaining({
        billingMode: "user_provided_keys",
        workspaceId
      })
    );
    expect(capabilities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "planning-and-approval",
          installState: "enabled",
          workspaceId
        })
      ])
    );
    expect(actorProfile.channelMemberships).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          channelId: created.conversation.id
        })
      ])
    );
  });

  it("projects custom AI teammate surfaces with scoped channels, tasks, calendar, files, skills, and memory", async () => {
    const created = await createCodingWorkflow(app, authCookie);
    const customAgent = await createCustomAgent(app, authCookie);

    await client.query(
      `
        INSERT INTO teammate_channel_memberships (
          id,
          owner_user_id,
          workspace_id,
          channel_id,
          teammate_id,
          teammate_kind
        )
        VALUES ($1, $2, $3, $4, $5, 'custom_agent')
      `,
      [
        randomUUID(),
        ownerUserId,
        workspaceId,
        created.conversation.id,
        customAgent.id
      ]
    );
    await client.query(
      `
        INSERT INTO workspace_tasks (
          id,
          owner_user_id,
          workspace_id,
          title,
          summary,
          state,
          priority,
          owner_scope,
          owner_scope_id,
          teammate_id,
          channel_id,
          source_kind
        )
        VALUES ($1, $2, $3, $4, $5, 'in_progress', 'normal', 'teammate', $6, $7, $8, 'manual')
      `,
      [
        randomUUID(),
        ownerUserId,
        workspaceId,
        "整理视觉验收要点",
        "补齐页面验收口径并同步频道。",
        customAgent.id,
        customAgent.id,
        created.conversation.id
      ]
    );
    await client.query(
      `
        INSERT INTO calendar_events (
          id,
          owner_user_id,
          workspace_id,
          title,
          summary,
          owner_scope,
          owner_scope_id,
          teammate_id,
          channel_id,
          start_at,
          end_at,
          status
        )
        VALUES ($1, $2, $3, $4, $5, 'teammate', $6, $7, $8, now(), now() + interval '1 hour', 'scheduled')
      `,
      [
        randomUUID(),
        ownerUserId,
        workspaceId,
        "视觉验收同步",
        "和频道中的其他同事对齐视觉风险。",
        customAgent.id,
        customAgent.id,
        created.conversation.id
      ]
    );
    await client.query(
      `
        INSERT INTO workspace_skill_bindings (
          id,
          owner_user_id,
          workspace_id,
          skill_id,
          teammate_id,
          enabled
        )
        VALUES ($1, $2, $3, 'memory-sync', $4, true)
      `,
      [randomUUID(), ownerUserId, workspaceId, customAgent.id]
    );

    const customMessageId = randomUUID();
    await client.query(
      `
        INSERT INTO messages (
          id,
          conversation_id,
          role,
          content,
          mentioned_agent_ids,
          owner_user_id,
          source_agent_id,
          is_pinned,
          workspace_id
        )
        VALUES ($1, $2, 'assistant', $3, '[]'::jsonb, $4, $5, false, $6)
      `,
      [
        customMessageId,
        created.conversation.id,
        "我会整理视觉验收标准并回写频道。",
        ownerUserId,
        customAgent.id,
        workspaceId
      ]
    );
    await seedArtifact(client, {
      messageId: customMessageId,
      title: "视觉验收清单",
      workspaceId
    });

    const memoryResponse = await app.inject({
      headers: {
        cookie: authCookie
      },
      method: "POST",
      payload: {
        content: "优先记录会影响验收结论的视觉风险。",
        conversationId: created.conversation.id,
        scope: "actor",
        source: "manual",
        teammateId: customAgent.id,
        title: "视觉验收偏好",
        workspaceId
      },
      url: "/memory"
    });

    expect(memoryResponse.statusCode).toBe(201);

    const [
      actorProfile,
      channels,
      tasks,
      calendar,
      files,
      skills,
      memory,
      memberDirectory
    ] = await Promise.all([
      getJson<ActorProfile>(
        app,
        authCookie,
        `/actor-profile?teammateId=${customAgent.id}&workspaceId=${workspaceId}`
      ),
      getJson<ChannelSummary[]>(
        app,
        authCookie,
        `/channels?teammateId=${customAgent.id}&workspaceId=${workspaceId}`
      ),
      getJson<WorkspaceTask[]>(
        app,
        authCookie,
        `/tasks?teammateId=${customAgent.id}&workspaceId=${workspaceId}`
      ),
      getJson<CalendarEvent[]>(
        app,
        authCookie,
        `/calendar?teammateId=${customAgent.id}&workspaceId=${workspaceId}`
      ),
      getJson<FileSurfaceEntry[]>(
        app,
        authCookie,
        `/actor-files?teammateId=${customAgent.id}&workspaceId=${workspaceId}`
      ),
      getJson<SkillBinding[]>(
        app,
        authCookie,
        `/skills?teammateId=${customAgent.id}&workspaceId=${workspaceId}`
      ),
      getJson<MemoryRecord[]>(
        app,
        authCookie,
        `/memory?teammateId=${customAgent.id}&workspaceId=${workspaceId}`
      ),
      getJson<WorkspaceMemberDirectoryEntry[]>(
        app,
        authCookie,
        `/workspace-member-directory?workspaceId=${workspaceId}`
      )
    ]);

    expect(actorProfile).toEqual(
      expect.objectContaining({
        executionPlane: "deferred_remote",
        id: customAgent.id,
        kind: "custom",
        mission: customAgent.systemPrompt,
        name: customAgent.name
      })
    );
    expect(actorProfile.channelMemberships).toEqual([
      expect.objectContaining({
        channelId: created.conversation.id,
        title: created.conversation.title
      })
    ]);
    expect(channels).toEqual([
      expect.objectContaining({
        id: created.conversation.id,
        memberTeammateIds: expect.arrayContaining([customAgent.id])
      })
    ]);
    expect(tasks).toEqual([
      expect.objectContaining({
        teammateId: customAgent.id,
        title: "整理视觉验收要点"
      })
    ]);
    expect(calendar).toEqual([
      expect.objectContaining({
        teammateId: customAgent.id,
        title: "视觉验收同步"
      })
    ]);
    expect(files).toEqual([
      expect.objectContaining({
        messageId: customMessageId,
        title: "视觉验收清单"
      })
    ]);
    expect(skills).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "qa-and-validation",
          teammateIds: expect.arrayContaining([customAgent.id])
        }),
        expect.objectContaining({
          id: "memory-sync",
          teammateIds: expect.arrayContaining([customAgent.id])
        })
      ])
    );
    expect(memory).toEqual([
      expect.objectContaining({
        teammateId: customAgent.id,
        title: "视觉验收偏好"
      })
    ]);
    expect(memberDirectory).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          displayName: customAgent.name,
          principalKind: "ai_teammate",
          teammateId: customAgent.id
        })
      ])
    );
  });
});

async function createCodingWorkflow(
  app: NestFastifyApplication,
  authCookie: string
): Promise<{ conversation: Conversation; workflow: CodingWorkflowDetail }> {
  const createResponse = await app.inject({
    headers: {
      cookie: authCookie
    },
    method: "POST",
    payload: {
      deadline: "今天 18:00",
      goal: "把 Phase D 壳层数据投影到频道、同事、任务和收件箱里",
      priority: "high",
      repoContext: "Phase D shell routes",
      workspaceId
    },
    url: "/coding-workflows"
  });

  expect(createResponse.statusCode).toBe(201);
  return createResponse.json() as {
    conversation: Conversation;
    workflow: CodingWorkflowDetail;
  };
}

async function createCustomAgent(
  app: NestFastifyApplication,
  authCookie: string
): Promise<CustomAgent> {
  const response = await app.inject({
    headers: {
      cookie: authCookie
    },
    method: "POST",
    payload: {
      capabilityTags: ["测试", "记忆"],
      name: "视觉验收同事",
      provider: "mock",
      systemPrompt: "负责整理视觉验收标准、风险和回归要点。",
      toolBindings: [],
      workspaceId
    },
    url: "/custom-agents"
  });

  expect(response.statusCode).toBe(201);
  return response.json() as CustomAgent;
}

async function getJson<T>(
  app: NestFastifyApplication,
  authCookie: string,
  url: string
): Promise<T> {
  const response = await app.inject({
    headers: {
      cookie: authCookie
    },
    method: "GET",
    url
  });

  expect(response.statusCode).toBe(200);
  return response.json() as T;
}

async function seedArtifact(
  client: Client,
  input: {
    messageId: string;
    title: string;
    workspaceId: string;
  }
): Promise<void> {
  await client.query(
    `
      INSERT INTO artifacts (
        id,
        kind,
        message_id,
        mime_type,
        preview_url,
        storage_key,
        title,
        workspace_id
      )
      VALUES ($1, 'attachment', $2, 'text/markdown', NULL, NULL, $3, $4)
    `,
    [randomUUID(), input.messageId, input.title, input.workspaceId]
  );
}

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
      encryptCredentialSecret(`${input.provider}_shell_secret`, encryptionKey),
      `${input.provider}-workspace-shell`,
      input.ownerUserId,
      input.provider,
      `acct_${input.provider}_workspace_shell`,
      input.workspaceId
    ]
  );
}
