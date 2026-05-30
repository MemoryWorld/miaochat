import { randomUUID } from "node:crypto";

import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import { sql } from "drizzle-orm";

import {
  calculateCodingWorkflowAgentProgress,
  buildExecutionTaskId,
  buildBuiltInCodingAgentInput,
  buildCodingKickoffMessage,
  buildCodingPlanSummary,
  buildCodingWorkflowTitle,
  buildInitialCodingTaskSnapshotForRoles,
  builtInCodingProfiles,
  codingWorkflowDecisionInputSchema,
  codingWorkflowDetailSchema,
  codingWorkflowLaunchResponseSchema,
  codingWorkflowQuerySchema,
  createCodingWorkflowInputSchema,
  deriveExecutionRoles,
  derivePlanningRole,
  getBuiltInCodingProfileName,
  hasCodingWorkflowExecutor,
  normalizeRecommendedRoleIds,
  type BuiltInCodingRole,
  type CodingWorkflowApproval,
  type CodingWorkflowDecision,
  type CodingWorkflowDetail,
  type CodingWorkflowExecutionStageAssignment,
  type CodingWorkflowTask,
  type CodingWorkflowTeammate,
  type Conversation,
  type ConversationAgentMember,
  type CustomAgent,
  type ProviderId,
  type RuntimeBackend
} from "@agenthub/contracts";

import { ConversationsRepository, type ConversationRow } from "../conversations/conversations.repository.js";
import { CustomAgentsService } from "../custom-agents/custom-agents.service.js";
import {
  DatabaseService,
  type DatabaseExecutor
} from "../database/database.service.js";
import { StreamBrokerService } from "../streams/stream-broker.service.js";
import { CodingWorkflowDispatchService } from "./coding-workflow-dispatch.service.js";

type CodingWorkflowRow = {
  active_plan_version: number;
  approval_state: CodingWorkflowDetail["approvalState"];
  conversation_id: string;
  created_at: Date;
  deadline: string | null;
  engineer_agent_id: string;
  execution_stage_assignments: CodingWorkflowExecutionStageAssignment[];
  extra_agent_ids: string[];
  goal: string;
  id: string;
  kickoff_message_id: string | null;
  owner_user_id: string;
  plan_message_id: string | null;
  planning_role: BuiltInCodingRole;
  planning_teammate_id: string;
  priority: CodingWorkflowDetail["priority"];
  qa_agent_id: string;
  repo_context: string | null;
  reviewer_agent_id: string;
  runtime_backend: RuntimeBackend;
  state: CodingWorkflowDetail["state"];
  task_snapshot: CodingWorkflowTask[];
  tech_lead_agent_id: string;
  updated_at: Date;
  workspace_id: string;
};

type CodingWorkflowApprovalRow = {
  actor_user_id: string;
  created_at: Date;
  decision: CodingWorkflowDecision;
  id: string;
  note: string | null;
  plan_version: number;
};

type CustomAgentRow = {
  capability_tags: string[];
  id: string;
  name: string;
  provider: ProviderId;
};

type RuntimeAssignment = {
  provider: ProviderId;
  runtimeBackend: RuntimeBackend;
};

@Injectable()
export class CodingWorkflowsService {
  constructor(
    @Inject(ConversationsRepository)
    private readonly conversationsRepository: ConversationsRepository,
    @Inject(CustomAgentsService)
    private readonly customAgentsService: CustomAgentsService,
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(StreamBrokerService)
    private readonly streamBroker: StreamBrokerService,
    @Inject(CodingWorkflowDispatchService)
    private readonly dispatchService: CodingWorkflowDispatchService
  ) {}

  async create(input: unknown, ownerUserId: string) {
    const parsed = createCodingWorkflowInputSchema.parse(input);
    const recommendedRoleIds = normalizeRecommendedRoleIds(parsed.recommendedRoleIds);
    if (!hasCodingWorkflowExecutor(recommendedRoleIds)) {
      throw new BadRequestException("至少要保留 1 位能够进入实现阶段的 AI 同事。");
    }
    const runtimeAssignment = await this.resolveRuntimeAssignment(
      ownerUserId,
      parsed.workspaceId
    );
    const builtInTeammates = await this.ensureBuiltInTeammates({
      ownerUserId,
      provider: runtimeAssignment.provider,
      workspaceId: parsed.workspaceId
    });
    const extraTeammates = await this.resolveExtraTeammates({
      agentIds: parsed.extraAgentIds,
      ownerUserId,
      workspaceId: parsed.workspaceId
    });
    const planningRole = derivePlanningRole(recommendedRoleIds);
    const executionRoles = deriveExecutionRoles(recommendedRoleIds);
    const planningTeammate = requireBuiltInTeammateForRole(
      builtInTeammates,
      planningRole
    );
    const selectedBuiltInTeammates = recommendedRoleIds.map((role) =>
      requireBuiltInTeammateForRole(builtInTeammates, role)
    );
    const executionStageAssignments = executionRoles.map((role) => ({
      agentId: requireBuiltInTeammateForRole(builtInTeammates, role).id,
      role
    }));
    const techLead = requireBuiltInTeammateForRole(builtInTeammates, "tech_lead");
    const engineer = requireBuiltInTeammateForRole(builtInTeammates, "software_engineer");
    const reviewer = requireBuiltInTeammateForRole(builtInTeammates, "code_reviewer");
    const qa = requireBuiltInTeammateForRole(builtInTeammates, "qa_tester");
    const conversationId = randomUUID();
    const kickoffMessageId = randomUUID();
    const planMessageId = randomUUID();
    const workflowId = randomUUID();
    const taskSnapshot = buildInitialCodingTaskSnapshotForRoles(recommendedRoleIds);
    const title = buildCodingWorkflowTitle(parsed.goal);
    const participants = [...selectedBuiltInTeammates, ...extraTeammates].map((agent) => ({
      agentId: agent.id,
      agentName: agent.name
    }));

    const conversation = await this.database.transaction(async (tx) => {
      const conversationRow = await this.conversationsRepository.createConversation(
        {
          id: conversationId,
          mode: "group",
          ownerUserId,
          title,
          workspaceId: parsed.workspaceId
        },
        tx
      );
      await this.conversationsRepository.insertConversationAgents(
        conversationId,
        parsed.workspaceId,
        participants,
        tx
      );

      await this.insertMessage(
        tx,
        {
          content: buildCodingKickoffMessage({
            customTeammateNames: extraTeammates.map((agent) => agent.name),
            deadline: parsed.deadline ?? null,
            executionTeammateNames: executionStageAssignments.map((assignment) =>
              requireBuiltInTeammateForRole(builtInTeammates, assignment.role).name
            ),
            goal: parsed.goal,
            planningName: planningTeammate.name,
            priority: parsed.priority,
            repoContext: parsed.repoContext ?? null
          }),
          conversationId,
          id: kickoffMessageId,
          ownerUserId,
          role: "user",
          sourceAgentId: null,
          workspaceId: parsed.workspaceId
        }
      );

      await this.insertMessage(
        tx,
        {
          content: buildCodingPlanSummary({
            deadline: parsed.deadline ?? null,
            executionRoles: recommendedRoleIds,
            goal: parsed.goal,
            planningName: planningTeammate.name,
            priority: parsed.priority,
            repoContext: parsed.repoContext ?? null
          }),
          conversationId,
          id: planMessageId,
          ownerUserId,
          role: "assistant",
          sourceAgentId: planningTeammate.id,
          workspaceId: parsed.workspaceId
        }
      );

      await tx.execute(sql`
        INSERT INTO coding_workflows (
          id,
          conversation_id,
          owner_user_id,
          workspace_id,
          state,
          approval_state,
          goal,
          repo_context,
          deadline,
          priority,
          runtime_backend,
          tech_lead_agent_id,
          engineer_agent_id,
          reviewer_agent_id,
          qa_agent_id,
          planning_teammate_id,
          planning_role,
          execution_stage_assignments,
          extra_agent_ids,
          kickoff_message_id,
          plan_message_id,
          active_plan_version,
          task_snapshot
        )
        VALUES (
          ${workflowId},
          ${conversationId},
          ${ownerUserId},
          ${parsed.workspaceId},
          ${"plan_pending_approval"},
          ${"pending"},
          ${parsed.goal},
          ${parsed.repoContext ?? null},
          ${parsed.deadline ?? null},
          ${parsed.priority},
          ${runtimeAssignment.runtimeBackend},
          ${techLead.id},
          ${engineer.id},
          ${reviewer.id},
          ${qa.id},
          ${planningTeammate.id},
          ${planningRole},
          ${JSON.stringify(executionStageAssignments)}::jsonb,
          ${JSON.stringify(extraTeammates.map((agent) => agent.id))}::jsonb,
          ${kickoffMessageId},
          ${planMessageId},
          ${1},
          ${JSON.stringify(taskSnapshot)}::jsonb
        )
      `);

      const planApprovalRequestId = randomUUID();
      await this.insertApprovalRequest(tx, {
        conversationId,
        id: planApprovalRequestId,
        kind: "coding_plan",
        note: null,
        ownerUserId,
        planVersion: 1,
        requesterTeammateId: planningRole,
        requesterTeammateName: planningTeammate.name,
        status: "pending",
        summary: `${planningTeammate.name}已提交第 1 版计划，等待用户确认是否进入实现阶段。`,
        title: "等待确认编码计划",
        workflowId,
        workspaceId: parsed.workspaceId
      });
      await this.insertActivityRound(tx, {
        actingTeammateId: planningRole,
        actingTeammateName: planningTeammate.name,
        approvalRequestId: planApprovalRequestId,
        channelId: conversationId,
        conversationId,
        metadata: {
          label: "coding.plan_pending_approval",
          planVersion: 1
        },
        outputPreview: null,
        ownerUserId,
        phase: "planning",
        status: "waiting_for_approval",
        stepLabel: "输出首版计划",
        stepSummary: "等待用户确认后再进入实现阶段。",
        summary: `${planningTeammate.name}已提交首版计划。`,
        toolActivityPreview: "计划整理与风险拆解",
        workflowId,
        workspaceId: parsed.workspaceId
      });

      return mapConversationRow(conversationRow, participants);
    });

    const workflow = await this.getRequiredDetail({
      id: workflowId,
      ownerUserId,
      workspaceId: parsed.workspaceId
    });

    this.publishWorkflowStatus({
      approvalState: workflow.approvalState,
      conversationId: workflow.conversationId,
      label: "coding.plan_pending_approval",
      state: "running",
      summary: `${planningTeammate.name}已提交首版计划，等待用户确认。`,
      taskSnapshot: workflow.taskSnapshot,
      workflow
    });

    return codingWorkflowLaunchResponseSchema.parse({
      conversation,
      workflow
    });
  }

  async get(input: unknown, ownerUserId: string): Promise<CodingWorkflowDetail | null> {
    const parsed = codingWorkflowQuerySchema.parse(input);
    return this.getDetail({
      conversationId: parsed.conversationId,
      id: parsed.id,
      ownerUserId,
      workspaceId: parsed.workspaceId
    });
  }

  async decide(
    workflowId: string,
    input: unknown,
    actorUserId: string
  ): Promise<CodingWorkflowDetail> {
    const parsed = codingWorkflowDecisionInputSchema.parse(input);
    const workflow = await this.getRequiredDetail({
      id: workflowId,
      ownerUserId: actorUserId,
      workspaceId: parsed.workspaceId
    });

    if (
      workflow.state !== "plan_pending_approval" &&
      parsed.decision !== "rejected"
    ) {
      throw new BadRequestException("Only pending plans can be approved or revised.");
    }

    if (
      workflow.state !== "plan_pending_approval" &&
      workflow.state !== "plan_rejected"
    ) {
      throw new BadRequestException("Workflow decisions are only allowed during the plan gate.");
    }

    const approvalId = randomUUID();

    await this.database.transaction(async (tx) => {
      await tx.execute(sql`
        INSERT INTO coding_workflow_approvals (
          id,
          workflow_id,
          owner_user_id,
          workspace_id,
          actor_user_id,
          decision,
          note,
          plan_version
        )
        VALUES (
          ${approvalId},
          ${workflow.id},
          ${actorUserId},
          ${workflow.workspaceId},
          ${actorUserId},
          ${parsed.decision},
          ${parsed.note ?? null},
          ${workflow.activePlanVersion}
        )
      `);

      switch (parsed.decision) {
        case "revision_requested":
          await this.handleRevisionDecision(tx, workflow, actorUserId, parsed.note ?? null);
          break;
        case "rejected":
          await this.handleRejectedDecision(tx, workflow, actorUserId, parsed.note ?? null);
          break;
        case "approved":
          await this.handleApprovedDecision(tx, workflow, actorUserId, parsed.note ?? null);
          break;
      }
    });

    const updated = await this.getRequiredDetail({
      id: workflow.id,
      ownerUserId: actorUserId,
      workspaceId: workflow.workspaceId
    });

    if (parsed.decision === "approved") {
      this.dispatchService.requestExecution(updated.id);
    }

    return updated;
  }

  private async ensureBuiltInTeammates(input: {
    ownerUserId: string;
    provider: ProviderId;
    workspaceId: string;
  }): Promise<CustomAgent[]> {
    const existingAgents = await this.customAgentsService.list(
      input.workspaceId,
      input.ownerUserId
    );
    const resolved: CustomAgent[] = [];

    for (const profile of builtInCodingProfiles) {
      const existing = existingAgents.find((agent) => agent.name === profile.name) ?? null;

      if (!existing) {
        const created = await this.createBuiltInAgentWithConflictReload({
          ownerUserId: input.ownerUserId,
          profileId: profile.id,
          provider: input.provider,
          workspaceId: input.workspaceId
        });
        resolved.push(created);
        continue;
      }

      if (existing.provider !== input.provider) {
        await this.database.execute(sql`
          UPDATE custom_agents
          SET
            capability_tags = ${JSON.stringify(profile.capabilityTags)}::jsonb,
            provider = ${input.provider},
            system_prompt = ${profile.starterPrompt},
            updated_at = now()
          WHERE id = ${existing.id}
            AND owner_user_id = ${input.ownerUserId}
            AND workspace_id = ${input.workspaceId}
        `);

        resolved.push({
          ...existing,
          capabilityTags: [...profile.capabilityTags],
          provider: input.provider,
          systemPrompt: profile.starterPrompt
        });
        continue;
      }

      resolved.push(existing);
    }

    return resolved;
  }

  private async createBuiltInAgentWithConflictReload(input: {
    ownerUserId: string;
    profileId: (typeof builtInCodingProfiles)[number]["id"];
    provider: ProviderId;
    workspaceId: string;
  }): Promise<CustomAgent> {
    const profile = builtInCodingProfiles.find((entry) => entry.id === input.profileId);

    if (!profile) {
      throw new Error(`Built-in coding profile ${input.profileId} not found.`);
    }

    try {
      return await this.customAgentsService.create(
        buildBuiltInCodingAgentInput(profile, input.provider, input.workspaceId),
        input.ownerUserId
      );
    } catch (error) {
      if (!(error instanceof ConflictException)) {
        throw error;
      }

      const agents = await this.customAgentsService.list(input.workspaceId, input.ownerUserId);
      const existing = agents.find((agent) => agent.name === profile.name);

      if (!existing) {
        throw error;
      }

      return existing;
    }
  }

  private async resolveExtraTeammates(input: {
    agentIds: string[];
    ownerUserId: string;
    workspaceId: string;
  }): Promise<CustomAgent[]> {
    if (input.agentIds.length === 0) {
      return [];
    }

    const agents = await this.customAgentsService.list(input.workspaceId, input.ownerUserId);
    const agentMap = new Map(agents.map((agent) => [agent.id, agent]));
    const resolved = input.agentIds.map((agentId) => agentMap.get(agentId) ?? null);

    if (resolved.some((agent) => !agent)) {
      throw new NotFoundException("One or more selected AI teammates were not found.");
    }

    return resolved.filter((agent): agent is CustomAgent => Boolean(agent));
  }

  private async resolveRuntimeAssignment(
    ownerUserId: string,
    workspaceId: string
  ): Promise<RuntimeAssignment> {
    const result = await this.database.execute<{
      provider: ProviderId;
    }>(sql`
      SELECT provider
      FROM provider_credentials
      WHERE owner_user_id = ${ownerUserId}
        AND workspace_id = ${workspaceId}
        AND validation_state = 'valid'
      ORDER BY created_at DESC, id DESC
    `);

    const providers = result.rows.map((row) => row.provider);

    if (providers.includes("deepseek")) {
      return {
        provider: "deepseek",
        runtimeBackend: "enhanced-hermes"
      };
    }

    if (providers.includes("hermes")) {
      return {
        provider: "hermes",
        runtimeBackend: "hermes-compat"
      };
    }

    if (providers.includes("openclaw")) {
      return {
        provider: "openclaw",
        runtimeBackend: "openclaw-compat"
      };
    }

    if (process.env.NODE_ENV === "test") {
      return {
        provider: "mock",
        runtimeBackend: "mock"
      };
    }

    throw new BadRequestException("请先在设置中完成模型连接，再启动编码工作流。");
  }

  private async getDetail(input: {
    conversationId?: string;
    id?: string;
    ownerUserId: string;
    workspaceId: string;
  }): Promise<CodingWorkflowDetail | null> {
    const row = await this.findWorkflowRow(input);

    if (!row) {
      return null;
    }

    return this.mapWorkflowDetail(row);
  }

  private async getRequiredDetail(input: {
    conversationId?: string;
    id?: string;
    ownerUserId: string;
    workspaceId: string;
  }): Promise<CodingWorkflowDetail> {
    const workflow = await this.getDetail(input);

    if (!workflow) {
      throw new NotFoundException("Coding workflow was not found.");
    }

    return workflow;
  }

  private async findWorkflowRow(input: {
    conversationId?: string;
    id?: string;
    ownerUserId: string;
    workspaceId: string;
  }): Promise<CodingWorkflowRow | null> {
    const filters = [
      sql`owner_user_id = ${input.ownerUserId}`,
      sql`workspace_id = ${input.workspaceId}`
    ];

    if (input.id) {
      filters.push(sql`id = ${input.id}`);
    }

    if (input.conversationId) {
      filters.push(sql`conversation_id = ${input.conversationId}`);
    }

    const result = await this.database.execute<CodingWorkflowRow>(sql`
      SELECT
        active_plan_version,
        approval_state,
        conversation_id,
        created_at,
        deadline,
        engineer_agent_id,
        execution_stage_assignments,
        extra_agent_ids,
        goal,
        id,
        kickoff_message_id,
        owner_user_id,
        plan_message_id,
        planning_role,
        planning_teammate_id,
        priority,
        qa_agent_id,
        repo_context,
        reviewer_agent_id,
        runtime_backend,
        state,
        task_snapshot,
        tech_lead_agent_id,
        updated_at,
        workspace_id
      FROM coding_workflows
      WHERE ${sql.join(filters, sql` AND `)}
      LIMIT 1
    `);

    return result.rows[0] ?? null;
  }

  private async mapWorkflowDetail(row: CodingWorkflowRow): Promise<CodingWorkflowDetail> {
    const approvalsResult = await this.database.execute<CodingWorkflowApprovalRow>(sql`
      SELECT
        actor_user_id,
        created_at,
        decision,
        id,
        note,
        plan_version
      FROM coding_workflow_approvals
      WHERE workflow_id = ${row.id}
      ORDER BY created_at ASC, id ASC
    `);
    const teammateIds = [
      row.planning_teammate_id,
      ...row.execution_stage_assignments.map((assignment) => assignment.agentId),
      ...row.extra_agent_ids
    ];
    const teammates = await this.loadTeammates(row, teammateIds);

    const detail = {
      activePlanVersion: row.active_plan_version,
      approvalHistory: approvalsResult.rows.map(mapApprovalRow),
      approvalState: row.approval_state,
      conversationId: row.conversation_id,
      createdAt: row.created_at,
      deadline: row.deadline,
      engineerAgentId: row.engineer_agent_id,
      extraAgentIds: row.extra_agent_ids ?? [],
      goal: row.goal,
      id: row.id,
      kickoffMessageId: row.kickoff_message_id,
      ownerUserId: row.owner_user_id,
      planMessageId: row.plan_message_id,
      planningRole: row.planning_role,
      planningTeammateId: row.planning_teammate_id,
      priority: row.priority,
      qaAgentId: row.qa_agent_id,
      repoContext: row.repo_context,
      reviewerAgentId: row.reviewer_agent_id,
      runtimeBackend: row.runtime_backend,
      state: row.state,
      taskSnapshot: row.task_snapshot ?? [],
      teammates,
      techLeadAgentId: row.tech_lead_agent_id,
      executionStageAssignments: row.execution_stage_assignments ?? [],
      updatedAt: row.updated_at,
      workspaceId: row.workspace_id
    };

    return codingWorkflowDetailSchema.parse(detail);
  }

  private async loadTeammates(
    row: CodingWorkflowRow,
    teammateIds: string[]
  ): Promise<CodingWorkflowTeammate[]> {
    const uniqueIds = [...new Set(teammateIds)];

    if (uniqueIds.length === 0) {
      return [];
    }

    const result = await this.database.execute<CustomAgentRow>(sql`
      SELECT id, name, provider, capability_tags
      FROM custom_agents
      WHERE workspace_id = ${row.workspace_id}
        AND owner_user_id = ${row.owner_user_id}
        AND id IN (${sql.join(uniqueIds.map((id) => sql`${id}`), sql`, `)})
    `);

    const agentMap = new Map(result.rows.map((agent) => [agent.id, agent]));
    const builtInRoles = new Map<string, CodingWorkflowTeammate["role"]>([
      [row.planning_teammate_id, row.planning_role],
      ...row.execution_stage_assignments.map((assignment) => [
        assignment.agentId,
        assignment.role
      ] as const)
    ]);

    return uniqueIds.flatMap((agentId) => {
      const agent = agentMap.get(agentId);

      if (!agent) {
        return [];
      }

      const role = builtInRoles.get(agentId) ?? null;

      return [
        {
          agentId,
          isBuiltIn: role !== null,
          name: agent.name,
          role,
          runtimeBackend: role !== null ? row.runtime_backend : mapProviderToRuntimeBackend(agent.provider)
        }
      ];
    });
  }

  private async handleRevisionDecision(
    tx: DatabaseExecutor,
    workflow: CodingWorkflowDetail,
    ownerUserId: string,
    note: string | null
  ): Promise<void> {
    const nextPlanVersion = workflow.activePlanVersion + 1;
    const nextPlanMessageId = randomUUID();
    const selectedRoleIds = buildSelectedRoleIdsFromWorkflow(workflow);
    const nextTaskSnapshot = buildInitialCodingTaskSnapshotForRoles(selectedRoleIds);
    const planningName = resolvePlanningTeammateName(workflow);

    await this.insertMessage(
      tx,
      {
        content: `用户要求${planningName}重提计划。${note ? `\n反馈：${note}` : ""}`,
        conversationId: workflow.conversationId,
        id: randomUUID(),
        ownerUserId,
        role: "system",
        sourceAgentId: null,
        workspaceId: workflow.workspaceId
      }
    );

    await this.insertMessage(
      tx,
        {
          content: buildCodingPlanSummary({
            deadline: workflow.deadline,
            executionRoles: selectedRoleIds,
            goal: workflow.goal,
            planningName,
            priority: workflow.priority,
            repoContext: workflow.repoContext,
          revisionNote: note
        }),
        conversationId: workflow.conversationId,
        id: nextPlanMessageId,
        ownerUserId,
        role: "assistant",
        sourceAgentId: workflow.planningTeammateId,
        workspaceId: workflow.workspaceId
      }
    );

    await tx.execute(sql`
      UPDATE coding_workflows
      SET
        approval_state = 'pending',
        state = 'plan_pending_approval',
        active_plan_version = ${nextPlanVersion},
        plan_message_id = ${nextPlanMessageId},
        task_snapshot = ${JSON.stringify(nextTaskSnapshot)}::jsonb,
        updated_at = now()
      WHERE id = ${workflow.id}
        AND owner_user_id = ${ownerUserId}
        AND workspace_id = ${workflow.workspaceId}
    `);
    await this.completeLatestApprovalRequest(tx, {
      note,
      ownerUserId,
      status: "revision_requested",
      workflowId: workflow.id,
      workspaceId: workflow.workspaceId
    });
    const nextApprovalRequestId = randomUUID();
    await this.insertApprovalRequest(tx, {
      conversationId: workflow.conversationId,
      id: nextApprovalRequestId,
      kind: "coding_plan",
      note: note ?? null,
      ownerUserId,
      planVersion: nextPlanVersion,
      requesterTeammateId: workflow.planningRole,
      requesterTeammateName: planningName,
      status: "pending",
      summary: `${planningName}已根据反馈重提第 ${nextPlanVersion} 版计划，等待用户确认。`,
      title: `等待确认编码计划（第 ${nextPlanVersion} 版）`,
      workflowId: workflow.id,
      workspaceId: workflow.workspaceId
    });
    await this.insertActivityRound(tx, {
      actingTeammateId: workflow.planningRole,
      actingTeammateName: planningName,
      approvalRequestId: nextApprovalRequestId,
      channelId: workflow.conversationId,
      conversationId: workflow.conversationId,
      metadata: {
        decision: "revision_requested",
        label: "coding.plan_revision_requested",
        planVersion: nextPlanVersion
      },
      outputPreview: note,
      ownerUserId,
      phase: "planning",
      status: "waiting_for_approval",
      stepLabel: "根据反馈调整计划",
      stepSummary: note ?? "用户要求技术负责人补充和调整计划。",
      summary: `用户要求${planningName}修改计划，系统已生成新一版待审批计划。`,
      toolActivityPreview: "重写计划与风险说明",
      workflowId: workflow.id,
      workspaceId: workflow.workspaceId
    });

    this.publishWorkflowStatus({
      approvalState: "pending",
      conversationId: workflow.conversationId,
      label: "coding.plan_revision_requested",
      state: "running",
      summary: `用户要求${planningName}调整计划，系统已回写新版计划。`,
      taskSnapshot: nextTaskSnapshot,
      workflow: {
        ...workflow,
        activePlanVersion: nextPlanVersion,
        approvalState: "pending",
        planMessageId: nextPlanMessageId,
        state: "plan_pending_approval",
        taskSnapshot: nextTaskSnapshot
      }
    });
  }

  private async handleRejectedDecision(
    tx: DatabaseExecutor,
    workflow: CodingWorkflowDetail,
    ownerUserId: string,
    note: string | null
  ): Promise<void> {
    await this.insertMessage(
      tx,
      {
        content: `用户拒绝了当前计划。${note ? `\n原因：${note}` : ""}`,
        conversationId: workflow.conversationId,
        id: randomUUID(),
        ownerUserId,
        role: "system",
        sourceAgentId: null,
        workspaceId: workflow.workspaceId
      }
    );

    await tx.execute(sql`
      UPDATE coding_workflows
      SET
        approval_state = 'rejected',
        state = 'plan_rejected',
        updated_at = now()
      WHERE id = ${workflow.id}
        AND owner_user_id = ${ownerUserId}
        AND workspace_id = ${workflow.workspaceId}
    `);
    await this.completeLatestApprovalRequest(tx, {
      note,
      ownerUserId,
      status: "rejected",
      workflowId: workflow.id,
      workspaceId: workflow.workspaceId
    });
    await this.insertActivityRound(tx, {
      actingTeammateId: workflow.planningRole,
      actingTeammateName: resolvePlanningTeammateName(workflow),
      approvalRequestId: null,
      channelId: workflow.conversationId,
      conversationId: workflow.conversationId,
      metadata: {
        decision: "rejected",
        label: "coding.plan_rejected"
      },
      outputPreview: note,
      ownerUserId,
      phase: "approval",
      status: "failed",
      stepLabel: "计划被拒绝",
      stepSummary: note ?? "用户拒绝了当前计划方向。",
      summary: "用户拒绝了当前计划，工作流停留在计划门禁阶段。",
      toolActivityPreview: null,
      workflowId: workflow.id,
      workspaceId: workflow.workspaceId
    });

    this.publishWorkflowStatus({
      approvalState: "rejected",
      conversationId: workflow.conversationId,
      label: "coding.plan_rejected",
      state: "failed",
      summary: "用户拒绝了当前计划，工作流停留在计划门禁阶段。",
      taskSnapshot: workflow.taskSnapshot,
      workflow: {
        ...workflow,
        approvalState: "rejected",
        state: "plan_rejected"
      }
    });
  }

  private async handleApprovedDecision(
    tx: DatabaseExecutor,
    workflow: CodingWorkflowDetail,
    ownerUserId: string,
    note: string | null
  ): Promise<void> {
    const firstExecutionAssignment = workflow.executionStageAssignments[0] ?? null;
    const firstExecutionTaskId = firstExecutionAssignment
      ? buildExecutionTaskId(firstExecutionAssignment.role)
      : null;
    const nextState = firstExecutionAssignment
      ? mapExecutionRoleToWorkflowState(firstExecutionAssignment.role)
      : "awaiting_user_confirmation";
    const nextTaskSnapshot: CodingWorkflowTask[] = workflow.taskSnapshot.map((task) => {
      if (task.id === "plan") {
        return {
          ...task,
          state: "done"
        };
      }

      if (firstExecutionTaskId && task.id === firstExecutionTaskId) {
        return {
          ...task,
          state: "in_progress"
        };
      }

      return task;
    });
    const firstExecutionName = firstExecutionAssignment
      ? workflow.teammates.find(
          (teammate) => teammate.agentId === firstExecutionAssignment.agentId
        )?.name ?? getBuiltInCodingProfileName(firstExecutionAssignment.role)
      : resolvePlanningTeammateName(workflow);

    await this.insertMessage(
      tx,
      {
        content: `用户已批准计划，开始进入执行阶段。${note ? `\n备注：${note}` : ""}`,
        conversationId: workflow.conversationId,
        id: randomUUID(),
        ownerUserId,
        role: "system",
        sourceAgentId: null,
        workspaceId: workflow.workspaceId
      }
    );

    await tx.execute(sql`
      UPDATE coding_workflows
      SET
        approval_state = 'approved',
        state = ${nextState},
        task_snapshot = ${JSON.stringify(nextTaskSnapshot)}::jsonb,
        updated_at = now()
      WHERE id = ${workflow.id}
        AND owner_user_id = ${ownerUserId}
        AND workspace_id = ${workflow.workspaceId}
    `);
    await this.completeLatestApprovalRequest(tx, {
      note,
      ownerUserId,
      status: "approved",
      workflowId: workflow.id,
      workspaceId: workflow.workspaceId
    });
    await this.insertActivityRound(tx, {
      actingTeammateId: firstExecutionAssignment?.role ?? workflow.planningRole,
      actingTeammateName: firstExecutionName,
      approvalRequestId: null,
      channelId: workflow.conversationId,
      conversationId: workflow.conversationId,
      metadata: {
        decision: "approved",
        label: mapExecutionRoleToStatusLabel(firstExecutionAssignment?.role ?? workflow.planningRole)
      },
      outputPreview: note,
      ownerUserId,
      phase: "approval",
      status: "succeeded",
      stepLabel: "计划批准进入实现",
      stepSummary: note ?? `用户批准计划，${firstExecutionName}进入执行阶段。`,
      summary: `计划已批准，${firstExecutionName}开始进入执行阶段。`,
      toolActivityPreview: "切换到实现执行平面",
      workflowId: workflow.id,
      workspaceId: workflow.workspaceId
    });

    this.publishWorkflowStatus({
      activeAgentName: firstExecutionName,
      approvalState: "approved",
      conversationId: workflow.conversationId,
      label: mapExecutionRoleToStatusLabel(firstExecutionAssignment?.role ?? workflow.planningRole),
      state: "running",
      summary: `计划已批准，${firstExecutionName}开始进入执行阶段。`,
      taskSnapshot: nextTaskSnapshot,
      workflow: {
        ...workflow,
        approvalState: "approved",
        state: nextState,
        taskSnapshot: nextTaskSnapshot
      }
    });
  }

  private async insertMessage(
    tx: DatabaseExecutor,
    input: {
      content: string;
      conversationId: string;
      id: string;
      ownerUserId: string;
      role: "assistant" | "system" | "user";
      sourceAgentId: string | null;
      workspaceId: string;
    }
  ): Promise<void> {
    await tx.execute(sql`
      INSERT INTO messages (
        id,
        content,
        conversation_id,
        is_pinned,
        mentioned_agent_ids,
        owner_user_id,
        role,
        source_agent_id,
        workspace_id
      )
      VALUES (
        ${input.id},
        ${input.content},
        ${input.conversationId},
        false,
        ${JSON.stringify([])}::jsonb,
        ${input.ownerUserId},
        ${input.role},
        ${input.sourceAgentId},
        ${input.workspaceId}
      )
    `);

    await tx.execute(sql`
      UPDATE conversations
      SET updated_at = now()
      WHERE id = ${input.conversationId}
        AND owner_user_id = ${input.ownerUserId}
        AND workspace_id = ${input.workspaceId}
    `);
  }

  private publishWorkflowStatus(input: {
    activeAgentName?: string;
    approvalState: CodingWorkflowDetail["approvalState"];
    conversationId: string;
    label: import("@agenthub/contracts").OrchestratorStatusEventPayload["label"];
    state: import("@agenthub/contracts").OrchestratorStatusEventPayload["state"];
    summary: string;
    taskSnapshot: CodingWorkflowTask[];
    workflow: CodingWorkflowDetail;
  }): void {
    this.streamBroker.publish({
      conversationId: input.conversationId,
      event: {
        kind: "conversation.status",
        payload: {
          activeAgentName: input.activeAgentName,
          approvalState: input.approvalState,
          failures: [],
          label: input.label,
          state: input.state,
          ...calculateCodingWorkflowAgentProgress({
            executionRoles: input.workflow.executionStageAssignments.map(
              (assignment) => assignment.role
            ),
            planningRole: input.workflow.planningRole,
            taskSnapshot: input.taskSnapshot
          }),
          summary: input.summary,
          taskSnapshot: input.taskSnapshot,
          workflowId: input.workflow.id,
          workflowState: input.workflow.state
        }
      },
      workspaceId: input.workflow.workspaceId
    });
  }

  private async insertApprovalRequest(
    tx: DatabaseExecutor,
    input: {
      conversationId: string;
      id: string;
      kind: "coding_plan" | "deployment" | "file_change" | "high_risk_action";
      note: string | null;
      ownerUserId: string;
      planVersion: number | null;
      requesterTeammateId: string | null;
      requesterTeammateName: string | null;
      status: "approved" | "pending" | "rejected" | "revision_requested";
      summary: string;
      title: string;
      workflowId: string;
      workspaceId: string;
    }
  ): Promise<void> {
    await tx.execute(sql`
      INSERT INTO approval_requests (
        id,
        owner_user_id,
        workspace_id,
        conversation_id,
        workflow_id,
        requester_teammate_id,
        requester_teammate_name,
        kind,
        title,
        summary,
        status,
        note,
        plan_version,
        created_at,
        updated_at
      )
      VALUES (
        ${input.id},
        ${input.ownerUserId},
        ${input.workspaceId},
        ${input.conversationId},
        ${input.workflowId},
        ${input.requesterTeammateId},
        ${input.requesterTeammateName},
        ${input.kind},
        ${input.title},
        ${input.summary},
        ${input.status},
        ${input.note},
        ${input.planVersion},
        now(),
        now()
      )
    `);
  }

  private async completeLatestApprovalRequest(
    tx: DatabaseExecutor,
    input: {
      note: string | null;
      ownerUserId: string;
      status: "approved" | "rejected" | "revision_requested";
      workflowId: string;
      workspaceId: string;
    }
  ): Promise<void> {
    await tx.execute(sql`
      UPDATE approval_requests
      SET
        status = ${input.status},
        response_note = ${input.note},
        responded_at = now(),
        updated_at = now()
      WHERE id = (
        SELECT id
        FROM approval_requests
        WHERE workflow_id = ${input.workflowId}
          AND owner_user_id = ${input.ownerUserId}
          AND workspace_id = ${input.workspaceId}
          AND status = 'pending'
        ORDER BY created_at DESC, id DESC
        LIMIT 1
      )
    `);
  }

  private async insertActivityRound(
    tx: DatabaseExecutor,
    input: {
      actingTeammateId: string | null;
      actingTeammateName: string | null;
      approvalRequestId: string | null;
      channelId: string;
      conversationId: string;
      metadata: Record<string, unknown>;
      outputPreview: string | null;
      ownerUserId: string;
      phase: "approval" | "coordination" | "implementation" | "memory" | "planning" | "qa" | "review";
      status: "failed" | "pending" | "running" | "succeeded" | "waiting_for_approval";
      stepLabel: string;
      stepSummary: string | null;
      summary: string;
      toolActivityPreview: string | null;
      workflowId: string;
      workspaceId: string;
    }
  ): Promise<void> {
    const roundId = randomUUID();

    await tx.execute(sql`
      INSERT INTO activity_rounds (
        id,
        owner_user_id,
        workspace_id,
        conversation_id,
        workflow_id,
        channel_id,
        acting_teammate_id,
        acting_teammate_name,
        phase,
        status,
        summary,
        tool_activity_preview,
        output_preview,
        approval_request_id,
        metadata,
        started_at,
        created_at,
        updated_at
      )
      VALUES (
        ${roundId},
        ${input.ownerUserId},
        ${input.workspaceId},
        ${input.conversationId},
        ${input.workflowId},
        ${input.channelId},
        ${input.actingTeammateId},
        ${input.actingTeammateName},
        ${input.phase},
        ${input.status},
        ${input.summary},
        ${input.toolActivityPreview},
        ${input.outputPreview},
        ${input.approvalRequestId},
        ${JSON.stringify(input.metadata)}::jsonb,
        now(),
        now(),
        now()
      )
    `);

    await tx.execute(sql`
      INSERT INTO activity_round_steps (
        id,
        round_id,
        label,
        status,
        summary,
        created_at
      )
      VALUES (
        ${randomUUID()},
        ${roundId},
        ${input.stepLabel},
        ${input.status},
        ${input.stepSummary},
        now()
      )
    `);
  }
}

function requireBuiltInTeammateForRole(
  agents: CustomAgent[],
  role: BuiltInCodingRole
): CustomAgent {
  const expectedName = getBuiltInCodingProfileName(role);
  const agent = agents.find((entry) => entry.name === expectedName);

  if (!agent) {
    throw new Error(`Built-in teammate ${expectedName} was not prepared.`);
  }

  return agent;
}

function buildSelectedRoleIdsFromWorkflow(
  workflow: Pick<
    CodingWorkflowDetail,
    "executionStageAssignments" | "planningRole"
  >
): BuiltInCodingRole[] {
  const orderedRoles = [
    workflow.planningRole,
    ...workflow.executionStageAssignments.map((assignment) => assignment.role)
  ];

  return normalizeRecommendedRoleIds(orderedRoles);
}

function resolvePlanningTeammateName(
  workflow: Pick<CodingWorkflowDetail, "planningTeammateId" | "teammates">
): string {
  return (
    workflow.teammates.find(
      (teammate) => teammate.agentId === workflow.planningTeammateId
    )?.name ?? "计划负责人"
  );
}

function mapExecutionRoleToWorkflowState(
  role: BuiltInCodingRole
): CodingWorkflowDetail["state"] {
  switch (role) {
    case "software_engineer":
    case "tech_lead":
      return "execution_running";
    case "code_reviewer":
      return "review_running";
    case "qa_tester":
      return "qa_running";
  }
}

function mapExecutionRoleToStatusLabel(
  role: BuiltInCodingRole
): "coding.execution_started" | "coding.qa_started" | "coding.review_started" {
  switch (role) {
    case "software_engineer":
    case "tech_lead":
      return "coding.execution_started";
    case "code_reviewer":
      return "coding.review_started";
    case "qa_tester":
      return "coding.qa_started";
  }
}

function mapApprovalRow(row: CodingWorkflowApprovalRow): CodingWorkflowApproval {
  return {
    actorUserId: row.actor_user_id,
    createdAt: row.created_at,
    decision: row.decision,
    id: row.id,
    note: row.note,
    planVersion: row.plan_version
  };
}

function mapProviderToRuntimeBackend(provider: ProviderId): RuntimeBackend {
  switch (provider) {
    case "deepseek":
      return "enhanced-hermes";
    case "hermes":
      return "hermes-compat";
    case "openclaw":
      return "openclaw-compat";
    case "mock":
      return "mock";
    case "codex":
    case "claude-code":
      return "claude-code-internal";
  }
}

function mapConversationRow(
  row: ConversationRow,
  participants: ConversationAgentMember[]
): Conversation {
  return {
    archivedAt: row.archived_at,
    id: row.id,
    isPinned: row.is_pinned ?? false,
    mode: row.mode,
    ownerUserId: row.owner_user_id,
    participants,
    pinnedMessageIds: row.pinned_message_ids ?? [],
    title: row.title,
    updatedAt: row.updated_at,
    workspaceId: row.workspace_id
  };
}
