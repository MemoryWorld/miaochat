import { describe, expect, it } from "vitest";

import {
  activityRoundSchema,
  artifactUploadTargetSchema,
  approvalRequestSchema,
  buildCodingKickoffMessage,
  buildInitialCodingTaskSnapshotForRoles,
  calculateCodingWorkflowAgentProgress,
  buildBuiltInActorProfile,
  channelMemberListSchema,
  conversationSchema,
  createArtifactInputSchema,
  createConversationInputSchema,
  createMemoryRecordInputSchema,
  createCustomAgentInputSchema,
  createModelConnectionInputSchema,
  createProviderCredentialInputSchema,
  billingPlanSummarySchema,
  capabilityManagementEntrySchema,
  deriveExecutionRoles,
  derivePlanningRole,
  executionPlaneBindingSchema,
  hasCodingWorkflowExecutor,
  inboxItemSchema,
  memoryRecordSchema,
  messageSchema,
  normalizeRecommendedRoleIds,
  prepareArtifactUploadInputSchema,
  skillBindingSchema,
  streamEventSchema,
  workspaceMemberDirectoryEntrySchema
} from "../src";

describe("@agenthub/contracts", () => {
  it("accepts future-ready workspace fields on conversations", () => {
    const parsed = conversationSchema.parse({
      id: "conv_1",
      mode: "group",
      ownerUserId: "user_1",
      participants: [{ agentId: "agent_1", agentName: "Hermes" }],
      pinnedMessageIds: [],
      title: "Planning",
      updatedAt: new Date().toISOString(),
      workspaceId: "workspace_1"
    });

    expect(parsed.workspaceId).toBe("workspace_1");
  });

  it("keeps provider credentials on the BYOK path by default", () => {
    const parsed = createProviderCredentialInputSchema.parse({
      label: "Main Codex",
      provider: "codex",
      providerAccountId: "acct_1",
      rawSecret: "secret_123"
    });

    expect(parsed.credentialSource).toBe("user_provided");
  });

  it("accepts DeepSeek-first model connections without exposing raw credentials", () => {
    const parsed = createModelConnectionInputSchema.parse({
      apiKey: "sk-test",
      label: "DeepSeek 工作区连接",
      model: "deepseek-chat",
      preset: "powerful",
      workspaceId: "workspace_1"
    });

    expect(parsed).toMatchObject({
      label: "DeepSeek 工作区连接",
      model: "deepseek-chat",
      preset: "powerful",
      workspaceId: "workspace_1"
    });
  });

  it("supports heavy custom-agent tool bindings", () => {
    const parsed = createCustomAgentInputSchema.parse({
      capabilityTags: ["code", "review"],
      name: "Reviewer",
      provider: "mock",
      systemPrompt: "Review changes",
      toolBindings: [
        {
          configPath: "/srv/tools/reviewer.json",
          name: "repo-review",
          runtime: "config_file"
        }
      ]
    });

    expect(parsed.toolBindings).toHaveLength(1);
    expect(parsed.provider).toBe("mock");
    expect(parsed.memoryMode).toBe("workspace_plus_teammate");
    expect(parsed.approvalMode).toBe("balanced");
    expect(parsed.outputStyle).toContain("清晰");
  });

  it("requires owner user ids on persisted user-scoped resources", () => {
    const customAgent = createCustomAgentInputSchema.parse({
      capabilityTags: ["code"],
      name: "Builder",
      provider: "mock",
      systemPrompt: "Build",
      toolBindings: []
    });
    const credential = createProviderCredentialInputSchema.parse({
      label: "Main Codex",
      provider: "codex",
      providerAccountId: "acct_1",
      rawSecret: "secret_123"
    });

    expect(customAgent.name).toBe("Builder");
    expect(credential.provider).toBe("codex");
    expect(
      conversationSchema.safeParse({
        id: "conv_missing_owner",
        mode: "direct",
        participants: [],
        pinnedMessageIds: [],
        title: "Missing owner",
        updatedAt: new Date().toISOString(),
        workspaceId: "workspace_1"
      }).success
    ).toBe(false);
  });

  it("validates normalized stream events", () => {
    const parsed = streamEventSchema.parse({
      kind: "conversation.message.delta",
      payload: {
        delta: "Hello",
        messageId: "msg_1"
      }
    });

    expect(parsed.kind).toBe("conversation.message.delta");
  });

  it("supports unified channel members and human-authored messages", () => {
    const members = channelMemberListSchema.parse({
      aiCount: 1,
      channelId: "conv_1",
      humanCount: 2,
      members: [
        {
          displayName: "你",
          kind: "human",
          memberId: "human:user_owner",
          permission: "manage",
          role: "owner",
          status: "active",
          userId: "user_owner"
        },
        {
          displayName: "张三",
          kind: "human",
          memberId: "human:user_zhang",
          permission: "comment",
          role: "member",
          status: "active",
          userId: "user_zhang"
        },
        {
          displayName: "软件工程师",
          kind: "ai",
          memberId: "ai:agent_engineer",
          permission: "comment",
          role: "ai_teammate",
          status: "available",
          teammateId: "agent_engineer"
        }
      ],
      totalCount: 3,
      workspaceId: "workspace_1"
    });
    const message = messageSchema.parse({
      author: {
        displayName: "张三",
        kind: "human",
        userId: "user_zhang"
      },
      authorUserId: "user_zhang",
      content: "请 @软件工程师 看一下这个方案。",
      conversationId: "conv_1",
      createdAt: new Date().toISOString(),
      id: "msg_1",
      mentionedAgentIds: ["agent_engineer"],
      mentionedUserIds: ["user_owner"],
      ownerUserId: "user_owner",
      role: "user",
      workspaceId: "workspace_1"
    });

    expect(members.totalCount).toBe(3);
    expect(message.author?.kind).toBe("human");
    expect(message.mentionedUserIds).toEqual(["user_owner"]);
  });

  it("supports structured orchestrator status events", () => {
    const parsed = streamEventSchema.parse({
      kind: "conversation.status",
      payload: {
        failures: [
          {
            agentId: "agent_failure",
            agentName: "Failure Scout",
            code: "error",
            detail: "Mock dispatch failed before completion.",
            provider: "mock"
          }
        ],
        label: "orchestrator.partial_failure",
        state: "failed",
        successfulAgentCount: 1,
        summary: "1 of 2 agents failed or timed out. Aggregated the remaining result.",
        totalAgentCount: 2
      }
    });

    expect(parsed.payload.failures).toHaveLength(1);
    expect(parsed.payload.label).toBe("orchestrator.partial_failure");
  });

  it("requires group conversations to include at least two agents", () => {
    const parsed = createConversationInputSchema.safeParse({
      agentIds: ["agent_1"],
      mode: "group"
    });

    expect(parsed.success).toBe(false);
  });

  it("supports artifact upload-target and metadata persistence contracts", () => {
    const uploadInput = prepareArtifactUploadInputSchema.parse({
      fileName: "release-checklist.md",
      kind: "attachment",
      messageId: "msg_1",
      mimeType: "text/markdown",
      title: "Release checklist",
      workspaceId: "workspace_1"
    });
    const artifactInput = createArtifactInputSchema.parse({
      id: "artifact_1",
      kind: "attachment",
      messageId: "msg_1",
      mimeType: "text/markdown",
      storageKey: "artifacts/workspace_1/msg_1/artifact_1/release-checklist.md",
      title: "Release checklist",
      workspaceId: "workspace_1"
    });
    const uploadTarget = artifactUploadTargetSchema.parse({
      artifactId: "artifact_1",
      previewUrl: null,
      storageKey: artifactInput.storageKey,
      uploadHeaders: {
        "content-type": uploadInput.mimeType
      },
      uploadMethod: "PUT",
      uploadUrl:
        "http://localhost:9000/agenthub-dev/artifacts/workspace_1/msg_1/artifact_1/release-checklist.md",
      workspaceId: "workspace_1"
    });

    expect(uploadTarget.uploadMethod).toBe("PUT");
    expect(artifactInput.workspaceId).toBe("workspace_1");
  });

  it("supports the Phase D actor, inbox, activity, approval, memory, and skill contracts", () => {
    const actor = buildBuiltInActorProfile({
      profile: {
        approvalPolicy: "先审批再执行",
        capabilityTags: ["builtin-coding-team", "计划"],
        id: "tech_lead",
        mission: "先给出计划",
        name: "技术负责人",
        responsibilities: ["拆解需求"],
        runtimeBackend: "enhanced-hermes",
        starterPrompt: "先写计划",
        summary: "规划与风险把控",
        toolPolicy: "默认只读",
        visibilityPolicy: "公开计划"
      },
      workspaceId: "workspace_1"
    });
    const inboxItem = inboxItemSchema.parse({
      createdAt: new Date().toISOString(),
      id: "inbox_1",
      kind: "approval_request",
      status: "action_required",
      summary: "技术负责人提交了首版计划。",
      title: "等待确认编码计划",
      updatedAt: new Date().toISOString(),
      workflowId: "workflow_1",
      workspaceId: "workspace_1"
    });
    const activity = activityRoundSchema.parse({
      createdAt: new Date().toISOString(),
      id: "round_1",
      phase: "planning",
      startedAt: new Date().toISOString(),
      status: "waiting_for_approval",
      steps: [
        {
          createdAt: new Date().toISOString(),
          id: "step_1",
          label: "输出首版计划",
          status: "waiting_for_approval",
          summary: "等待用户确认"
        }
      ],
      summary: "技术负责人已提交首版计划。",
      updatedAt: new Date().toISOString(),
      workflowId: "workflow_1",
      workspaceId: "workspace_1"
    });
    const approval = approvalRequestSchema.parse({
      createdAt: new Date().toISOString(),
      id: "approval_1",
      kind: "coding_plan",
      status: "pending",
      summary: "请确认是否进入实现阶段。",
      title: "编码计划审批",
      updatedAt: new Date().toISOString(),
      workflowId: "workflow_1",
      workspaceId: "workspace_1"
    });
    const memory = memoryRecordSchema.parse({
      content: "用户偏好先看计划再确认执行。",
      createdAt: new Date().toISOString(),
      id: "memory_1",
      scope: "workspace",
      source: "manual",
      title: "审批习惯",
      updatedAt: new Date().toISOString(),
      workspaceId: "workspace_1"
    });
    const skill = skillBindingSchema.parse({
      category: "工程",
      id: "plan-review",
      name: "计划评审",
      status: "active",
      summary: "用于输出计划和风险摘要。",
      teammateIds: [actor.id],
      workspaceEnabled: true,
      workspaceId: "workspace_1"
    });
    const memoryInput = createMemoryRecordInputSchema.parse({
      content: "记录一次新的偏好。",
      scope: "actor",
      teammateId: actor.id,
      title: "角色偏好",
      workspaceId: "workspace_1"
    });
    const executionPlane = executionPlaneBindingSchema.parse({
      audience: "planning",
      executionPlane: "in_process",
      runtimeBackend: "enhanced-hermes",
      summary: "计划和评审走轻量平面。"
    });

    expect(actor.executionPlane).toBe("in_process");
    expect(inboxItem.kind).toBe("approval_request");
    expect(activity.steps).toHaveLength(1);
    expect(approval.kind).toBe("coding_plan");
    expect(memory.scope).toBe("workspace");
    expect(memoryInput.source).toBe("manual");
    expect(skill.teammateIds).toContain(actor.id);
    expect(executionPlane.executionPlane).toBe("in_process");
  });

  it("supports Phase E admin and queue contracts", () => {
    const member = workspaceMemberDirectoryEntrySchema.parse({
      actorType: "ai",
      displayName: "测试工程师",
      id: "ai:qa_tester",
      principalKind: "ai_teammate",
      role: "agent",
      roleLabel: "AI 同事",
      status: "active",
      teammateId: "qa_tester",
      workspaceId: "workspace_1"
    });
    const billing = billingPlanSummarySchema.parse({
      aiTeammateCount: 4,
      billingMode: "user_provided_keys",
      currentPlan: "开发者预览",
      memberCount: 1,
      monthlyQuota: 0,
      monthlyUsage: 0,
      modelCostSummary: "用户自带模型 Key",
      workspaceId: "workspace_1"
    });
    const capability = capabilityManagementEntrySchema.parse({
      compatibleRoles: ["测试工程师"],
      enabled: true,
      id: "qa-and-validation",
      installState: "enabled",
      name: "验证与回归",
      permissionScope: "读取任务和测试记录",
      riskNote: "关键节点需要确认",
      source: "工作区能力库",
      summary: "执行测试并报告结果",
      version: "1.0.0",
      workspaceId: "workspace_1"
    });
    const inbox = inboxItemSchema.parse({
      createdAt: new Date().toISOString(),
      id: "inbox_connection",
      kind: "connection_alert",
      status: "action_required",
      summary: "模型连接需要重新验证。",
      title: "模型连接提醒",
      updatedAt: new Date().toISOString(),
      workspaceId: "workspace_1"
    });

    expect(member.actorType).toBe("ai");
    expect(billing.billingMode).toBe("user_provided_keys");
    expect(capability.installState).toBe("enabled");
    expect(inbox.kind).toBe("connection_alert");
  });

  it("derives planning and execution roles from the remaining recommended teammates", () => {
    expect(
      normalizeRecommendedRoleIds([
        "software_engineer",
        "software_engineer",
        "qa_tester"
      ])
    ).toEqual(["software_engineer", "qa_tester"]);
    expect(derivePlanningRole(["software_engineer", "qa_tester"])).toBe(
      "software_engineer"
    );
    expect(deriveExecutionRoles(["software_engineer", "qa_tester"])).toEqual([
      "software_engineer",
      "qa_tester"
    ]);
    expect(hasCodingWorkflowExecutor(["software_engineer", "qa_tester"])).toBe(true);
    expect(hasCodingWorkflowExecutor(["code_reviewer", "qa_tester"])).toBe(false);
    expect(buildInitialCodingTaskSnapshotForRoles(["software_engineer", "qa_tester"])).toEqual([
      expect.objectContaining({
        id: "plan",
        ownerRole: "software_engineer",
        title: "软件工程师提交计划"
      }),
      expect.objectContaining({
        id: "execution:software_engineer",
        ownerRole: "software_engineer"
      }),
      expect.objectContaining({
        id: "execution:qa_tester",
        ownerRole: "qa_tester"
      })
    ]);
  });

  it("uses unique participant counts when one teammate both plans and executes", () => {
    expect(
      calculateCodingWorkflowAgentProgress({
        executionRoles: ["software_engineer", "qa_tester"],
        planningRole: "software_engineer",
        taskSnapshot: [
          {
            id: "plan",
            ownerRole: "software_engineer",
            state: "done",
            title: "软件工程师提交计划"
          },
          {
            id: "execution:software_engineer",
            ownerRole: "software_engineer",
            state: "in_progress",
            title: "软件工程师按计划实现"
          },
          {
            id: "execution:qa_tester",
            ownerRole: "qa_tester",
            state: "todo",
            title: "测试工程师完成验证"
          }
        ]
      })
    ).toEqual({
      successfulAgentCount: 0,
      totalAgentCount: 2
    });
  });

  it("uses the single-actor kickoff copy when the planner is also the only executor", () => {
    expect(
      buildCodingKickoffMessage({
        customTeammateNames: [],
        executionTeammateNames: ["软件工程师"],
        goal: "收敛首页编码工作流",
        planningName: "软件工程师",
        priority: "normal"
      })
    ).toContain("如果只保留一位 AI 同事");
  });
});
