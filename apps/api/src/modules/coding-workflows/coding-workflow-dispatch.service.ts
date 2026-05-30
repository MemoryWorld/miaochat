import { randomUUID } from "node:crypto";

import {
  Inject,
  Injectable,
  type OnModuleDestroy
} from "@nestjs/common";
import {
  calculateCodingWorkflowAgentProgress,
  buildExecutionTaskId,
  builtInCodingProfiles,
  getBuiltInCodingProfileName,
  type CodingWorkflowTask,
  type CodingWorkflowExecutionStageAssignment,
  type OrchestratorStatusEventPayload,
  type RuntimeBackend,
  type StreamEvent
} from "@agenthub/contracts";
import { Client, Connection } from "@temporalio/client";
import { sql } from "drizzle-orm";

import { DatabaseService } from "../database/database.service.js";
import { StreamBrokerService } from "../streams/stream-broker.service.js";

type AgentExecutionContext = {
  pinnedMessages: Array<{
    content: string;
    id: string;
    role: "assistant" | "system" | "user";
  }>;
};

type ActiveWorkflowState =
  | "execution_running"
  | "review_running"
  | "qa_running"
  | "awaiting_user_confirmation"
  | "completed";

@Injectable()
export class CodingWorkflowDispatchService implements OnModuleDestroy {
  private readonly contextCache = new Map<string, AgentExecutionContext>();
  private connection: Connection | null = null;
  private temporalClient: Client | null = null;

  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(StreamBrokerService)
    private readonly streamBroker: StreamBrokerService
  ) {}

  async onModuleDestroy(): Promise<void> {
    await this.connection?.close();
  }

  requestExecution(workflowId: string): void {
    void this.executeApprovedWorkflow(workflowId).catch((error) => {
      console.error("coding_workflow.dispatch.failed", workflowId, error);
    });
  }

  private async executeApprovedWorkflow(workflowId: string): Promise<void> {
    const snapshot = await this.loadWorkflowSnapshot(workflowId);

    if (!snapshot) {
      return;
    }

    const stageResults: Array<{
      content: string;
      name: string;
      role: CodingWorkflowExecutionStageAssignment["role"];
    }> = [];
    let taskSnapshot = snapshot.taskSnapshot;

    try {
      void this.prefetchRuntimeContext(
        snapshot.conversationId,
        snapshot.workspaceId,
        snapshot.ownerUserId
      );
      for (const executionStage of snapshot.executionStages) {
        taskSnapshot = await this.runStage({
          activeAgentId: executionStage.agentId,
          activeAgentName: executionStage.name,
          assistantMessageId: randomUUID(),
          conversationId: snapshot.conversationId,
          currentTaskSnapshot: taskSnapshot,
          executionRoles: snapshot.executionStages.map((stage) => stage.role),
          ownerUserId: snapshot.ownerUserId,
          planningRole: snapshot.planningRole,
          prompt: buildExecutionPrompt(snapshot, executionStage, stageResults),
          runtimeBackend: snapshot.runtimeBackend,
          stageId: buildExecutionTaskId(executionStage.role),
          stageLabel: mapExecutionRoleToStatusLabel(executionStage.role),
          stageTeammateId: executionStage.role,
          summary: buildExecutionSummary(executionStage.role, executionStage.name),
          workflowId: snapshot.id,
          workflowState: mapExecutionRoleToWorkflowState(executionStage.role),
          workspaceId: snapshot.workspaceId
        });

        stageResults.push({
          content: await this.readLatestAssistantContent(
            snapshot.conversationId,
            snapshot.workspaceId,
            executionStage.agentId
          ),
          name: executionStage.name,
          role: executionStage.role
        });
      }

      await this.persistWorkflowState({
        state: "awaiting_user_confirmation",
        taskSnapshot,
        workflowId: snapshot.id
      });
      await this.publishWorkflowStatus({
        conversationId: snapshot.conversationId,
        executionRoles: snapshot.executionStages.map((stage) => stage.role),
        label: "coding.awaiting_user_confirmation",
        planningRole: snapshot.planningRole,
        state: "running",
        summary: "本次协作执行阶段已结束，结果正在等待用户确认。",
        taskSnapshot,
        workflowId: snapshot.id,
        workflowState: "awaiting_user_confirmation",
        workspaceId: snapshot.workspaceId
      });
      await this.recordWorkspaceMemorySummary({
        content: buildWorkspaceSummary(snapshot.goal, stageResults),
        ownerUserId: snapshot.ownerUserId,
        title: "最近一次编码工作流总结",
        workflowId: snapshot.id,
        workspaceId: snapshot.workspaceId
      });

      await this.persistWorkflowState({
        state: "completed",
        taskSnapshot,
        workflowId: snapshot.id
      });
      await this.publishWorkflowStatus({
        conversationId: snapshot.conversationId,
        executionRoles: snapshot.executionStages.map((stage) => stage.role),
        label: "coding.completed",
        planningRole: snapshot.planningRole,
        state: "succeeded",
        summary: "编码工作流已完成，完整计划、执行与验证结果都已回写。",
        taskSnapshot,
        workflowId: snapshot.id,
        workflowState: "completed",
        workspaceId: snapshot.workspaceId
      });
    } catch (error) {
      await this.publishWorkflowStatus({
        conversationId: snapshot.conversationId,
        executionRoles: snapshot.executionStages.map((stage) => stage.role),
        label: "coding.awaiting_user_confirmation",
        planningRole: snapshot.planningRole,
        state: "failed",
        summary:
          error instanceof Error
            ? `编码工作流执行失败：${error.message}`
            : "编码工作流执行失败。",
        taskSnapshot,
        workflowId: snapshot.id,
        workflowState: "awaiting_user_confirmation",
        workspaceId: snapshot.workspaceId
      });
      throw error;
    }
  }

  private async runStage(input: {
    activeAgentId: string;
    activeAgentName: string;
    assistantMessageId: string;
    conversationId: string;
    currentTaskSnapshot: CodingWorkflowTask[];
    executionRoles: readonly CodingWorkflowExecutionStageAssignment["role"][];
    ownerUserId: string;
    planningRole: CodingWorkflowExecutionStageAssignment["role"];
    prompt: string;
    runtimeBackend: RuntimeBackend;
    stageId: string;
    stageLabel: OrchestratorStatusEventPayload["label"];
    stageTeammateId: "code_reviewer" | "qa_tester" | "software_engineer" | "tech_lead";
    summary: string;
    workflowId: string;
    workflowState: ActiveWorkflowState;
    workspaceId: string;
  }): Promise<CodingWorkflowTask[]> {
    const taskSnapshot = startTask(input.currentTaskSnapshot, input.stageId);

    await this.persistWorkflowState({
      state: input.workflowState,
      taskSnapshot,
      workflowId: input.workflowId
    });
    await this.publishWorkflowStatus({
      activeAgentId: input.stageTeammateId,
      activeAgentName: input.activeAgentName,
      conversationId: input.conversationId,
      executionRoles: input.executionRoles,
      label: input.stageLabel,
      planningRole: input.planningRole,
      state: "running",
      summary: input.summary,
      taskSnapshot,
      workflowId: input.workflowId,
      workflowState: input.workflowState,
      workspaceId: input.workspaceId
    });
    const finalContent = await this.executeSingleAgent({
      agentId: input.activeAgentId,
      assistantMessageId: input.assistantMessageId,
      context: await this.loadPinnedContext(
        input.conversationId,
        input.workspaceId,
        input.ownerUserId
      ),
      conversationId: input.conversationId,
      message: input.prompt,
      ownerUserId: input.ownerUserId,
      runtimeBackend: input.runtimeBackend,
      workspaceId: input.workspaceId
    });
    await this.completeLatestActivityRound({
      outputPreview: finalContent,
      ownerUserId: input.ownerUserId,
      stageTeammateId: input.stageTeammateId,
      status: "succeeded",
      workflowId: input.workflowId,
      workspaceId: input.workspaceId
    });
    await this.recordActorMemory({
      content: finalContent,
      ownerUserId: input.ownerUserId,
      teammateId: input.stageTeammateId,
      title: `最近一次${input.activeAgentName}输出摘要`,
      workspaceId: input.workspaceId
    });

    return completeTask(taskSnapshot, input.stageId);
  }

  private async executeSingleAgent(input: {
    agentId: string;
    assistantMessageId: string;
    context: AgentExecutionContext;
    conversationId: string;
    message: string;
    ownerUserId: string;
    runtimeBackend: RuntimeBackend;
    workspaceId: string;
  }): Promise<string> {
    const client = await this.getTemporalClient();
    const execution = (await client.workflow.execute("internalRuntimeAgentWorkflow", {
      args: [
        {
          agentId: input.agentId,
          context: input.context,
          conversationId: input.conversationId,
          message: input.message,
          ownerUserId: input.ownerUserId,
          runtimeBackend: input.runtimeBackend,
          workspaceId: input.workspaceId
        }
      ],
      taskQueue: process.env.WORKER_TASK_QUEUE ?? "agenthub-default",
      workflowId: `coding-workflow-stage:${input.conversationId}:${input.agentId}:${randomUUID()}`
    })) as {
      finalContent: string;
      streamEvents: StreamEvent[];
    };

    const remappedEvents = remapStreamEventMessageIds(
      execution.streamEvents,
      input.assistantMessageId
    );

    for (const event of remappedEvents) {
      this.streamBroker.publish({
        conversationId: input.conversationId,
        event,
        workspaceId: input.workspaceId
      });
    }

    await this.insertAssistantMessage({
      content: execution.finalContent,
      conversationId: input.conversationId,
      id: input.assistantMessageId,
      ownerUserId: input.ownerUserId,
      sourceAgentId: input.agentId,
      workspaceId: input.workspaceId
    });
    return execution.finalContent;
  }

  private async getTemporalClient(): Promise<Client> {
    if (this.temporalClient) {
      return this.temporalClient;
    }

    this.connection = await Connection.connect({
      address: process.env.TEMPORAL_ADDRESS ?? "localhost:7233"
    });
    this.temporalClient = new Client({
      connection: this.connection
    });

    return this.temporalClient;
  }

  private async persistWorkflowState(input: {
    state: "awaiting_user_confirmation" | "completed" | "execution_running" | "qa_running" | "review_running";
    taskSnapshot: CodingWorkflowTask[];
    workflowId: string;
  }): Promise<void> {
    await this.database.execute(sql`
      UPDATE coding_workflows
      SET
        state = ${input.state},
        task_snapshot = ${JSON.stringify(input.taskSnapshot)}::jsonb,
        updated_at = now()
      WHERE id = ${input.workflowId}
    `);
  }

  private async loadWorkflowSnapshot(workflowId: string): Promise<WorkflowExecutionSnapshot | null> {
    const workflowResult = await this.database.execute<{
      approval_state: "approved" | "pending" | "rejected" | "revision_requested";
      conversation_id: string;
      deadline: string | null;
      execution_stage_assignments: CodingWorkflowExecutionStageAssignment[];
      goal: string;
      id: string;
      owner_user_id: string;
      plan_message_id: string | null;
      planning_role: CodingWorkflowExecutionStageAssignment["role"];
      planning_teammate_id: string;
      priority: "high" | "low" | "normal";
      repo_context: string | null;
      runtime_backend: RuntimeBackend;
      state:
        | "awaiting_user_confirmation"
        | "completed"
        | "execution_running"
        | "plan_pending_approval"
        | "plan_rejected"
        | "plan_revision_requested"
        | "qa_running"
        | "review_running";
      task_snapshot: CodingWorkflowTask[];
      tech_lead_agent_id: string;
      workspace_id: string;
    }>(sql`
      SELECT
        approval_state,
        conversation_id,
        deadline,
        execution_stage_assignments,
        goal,
        id,
        owner_user_id,
        plan_message_id,
        planning_role,
        planning_teammate_id,
        priority,
        repo_context,
        runtime_backend,
        state,
        task_snapshot,
        workspace_id
      FROM coding_workflows
      WHERE id = ${workflowId}
      LIMIT 1
    `);
    const workflow = workflowResult.rows[0];

    if (!workflow || workflow.approval_state !== "approved") {
      return null;
    }

    const agentIds = [
      workflow.planning_teammate_id,
      ...workflow.execution_stage_assignments.map((assignment) => assignment.agentId)
    ];
    const agentsResult = await this.database.execute<{
      id: string;
      name: string;
    }>(sql`
      SELECT id, name
      FROM custom_agents
      WHERE owner_user_id = ${workflow.owner_user_id}
        AND workspace_id = ${workflow.workspace_id}
        AND id IN (${sql.join(agentIds.map((id) => sql`${id}`), sql`, `)})
    `);
    const agentMap = new Map(agentsResult.rows.map((agent) => [agent.id, agent]));
    const planResult = workflow.plan_message_id
      ? await this.database.execute<{ content: string }>(sql`
          SELECT content
          FROM messages
          WHERE id = ${workflow.plan_message_id}
            AND conversation_id = ${workflow.conversation_id}
            AND owner_user_id = ${workflow.owner_user_id}
            AND workspace_id = ${workflow.workspace_id}
          LIMIT 1
        `)
      : { rows: [] as Array<{ content: string }> };

    const planningTeammate = agentMap.get(workflow.planning_teammate_id);
    const executionStages = workflow.execution_stage_assignments.map((assignment) => {
      const agent = agentMap.get(assignment.agentId);

      if (!agent) {
        throw new Error(`Execution teammate ${assignment.agentId} was not found for workflow ${workflowId}.`);
      }

      return {
        agentId: assignment.agentId,
        name: agent.name,
        role: assignment.role
      };
    });

    if (!planningTeammate) {
      throw new Error(`Planning teammate is incomplete for workflow ${workflowId}.`);
    }

    return {
      approvalState: workflow.approval_state,
      conversationId: workflow.conversation_id,
      deadline: workflow.deadline,
      executionStages,
      goal: workflow.goal,
      id: workflow.id,
      ownerUserId: workflow.owner_user_id,
      planContent: planResult.rows[0]?.content ?? "",
      planningRole: workflow.planning_role,
      planningTeammateId: workflow.planning_teammate_id,
      priority: workflow.priority,
      repoContext: workflow.repo_context,
      runtimeBackend: workflow.runtime_backend,
      state: workflow.state,
      taskSnapshot: workflow.task_snapshot ?? [],
      workspaceId: workflow.workspace_id
    };
  }

  private async loadPinnedContext(
    conversationId: string,
    workspaceId: string,
    ownerUserId: string
  ): Promise<AgentExecutionContext> {
    const cacheKey = buildContextCacheKey(conversationId, workspaceId, ownerUserId);
    const cached = this.contextCache.get(cacheKey);

    if (cached) {
      return cached;
    }

    const result = await this.database.execute<{
      content: string;
      id: string;
      role: "assistant" | "system" | "user";
    }>(sql`
      SELECT id, content, role
      FROM messages
      WHERE conversation_id = ${conversationId}
        AND workspace_id = ${workspaceId}
        AND owner_user_id = ${ownerUserId}
        AND is_pinned = true
      ORDER BY created_at ASC
    `);

    const resolved = {
      pinnedMessages: result.rows.map((row) => ({
        content: row.content,
        id: row.id,
        role: row.role
      }))
    };
    this.contextCache.set(cacheKey, resolved);
    return resolved;
  }

  private async insertAssistantMessage(input: {
    content: string;
    conversationId: string;
    id: string;
    ownerUserId: string;
    sourceAgentId: string;
    workspaceId: string;
  }): Promise<void> {
    await this.database.execute(sql`
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
        'assistant',
        ${input.sourceAgentId},
        ${input.workspaceId}
      )
    `);

    await this.database.execute(sql`
      UPDATE conversations
      SET updated_at = now()
      WHERE id = ${input.conversationId}
        AND owner_user_id = ${input.ownerUserId}
        AND workspace_id = ${input.workspaceId}
    `);
  }

  private async readLatestAssistantContent(
    conversationId: string,
    workspaceId: string,
    sourceAgentId: string
  ): Promise<string> {
    const result = await this.database.execute<{ content: string }>(sql`
      SELECT content
      FROM messages
      WHERE conversation_id = ${conversationId}
        AND workspace_id = ${workspaceId}
        AND source_agent_id = ${sourceAgentId}
      ORDER BY created_at DESC, id DESC
      LIMIT 1
    `);

    return result.rows[0]?.content ?? "";
  }

  private async prefetchRuntimeContext(
    conversationId: string,
    workspaceId: string,
    ownerUserId: string
  ): Promise<void> {
    const cacheKey = buildContextCacheKey(conversationId, workspaceId, ownerUserId);
    if (this.contextCache.has(cacheKey)) {
      return;
    }
    await this.loadPinnedContext(conversationId, workspaceId, ownerUserId);
  }

  private async publishWorkflowStatus(input: {
    activeAgentId?: string;
    activeAgentName?: string;
    conversationId: string;
    executionRoles: readonly CodingWorkflowExecutionStageAssignment["role"][];
    label: OrchestratorStatusEventPayload["label"];
    planningRole: CodingWorkflowExecutionStageAssignment["role"];
    state: OrchestratorStatusEventPayload["state"];
    summary: string;
    taskSnapshot: CodingWorkflowTask[];
    workflowId: string;
    workflowState: OrchestratorStatusEventPayload["workflowState"];
    workspaceId: string;
  }): Promise<void> {
    await this.insertActivityRound({
      actingTeammateId: input.activeAgentId ?? null,
      actingTeammateName: input.activeAgentName ?? null,
      channelId: input.conversationId,
      conversationId: input.conversationId,
      label: input.label,
      ownerUserId: await this.resolveWorkflowOwner(input.workflowId),
      phase: mapStatusLabelToPhase(input.label),
      status: mapOrchestratorStateToActivityStatus(input.state),
      summary: input.summary,
      toolActivityPreview: input.activeAgentName
        ? `${input.activeAgentName} 正在执行当前阶段`
        : null,
      workflowId: input.workflowId,
      workspaceId: input.workspaceId
    });
    this.streamBroker.publish({
      conversationId: input.conversationId,
      event: {
        kind: "conversation.status",
        payload: {
          activeAgentName: input.activeAgentName,
          approvalState: "approved",
          failures: [],
          label: input.label,
          state: input.state,
          ...calculateCodingWorkflowAgentProgress({
            executionRoles: input.executionRoles,
            planningRole: input.planningRole,
            taskSnapshot: input.taskSnapshot
          }),
          summary: input.summary,
          taskSnapshot: input.taskSnapshot,
          workflowId: input.workflowId,
          workflowState: input.workflowState
        }
      },
      workspaceId: input.workspaceId
    });
  }

  private async insertActivityRound(input: {
    actingTeammateId: string | null;
    actingTeammateName: string | null;
    channelId: string;
    conversationId: string;
    label: OrchestratorStatusEventPayload["label"];
    ownerUserId: string;
    phase: "approval" | "coordination" | "implementation" | "memory" | "planning" | "qa" | "review";
    status: "failed" | "pending" | "running" | "succeeded" | "waiting_for_approval";
    summary: string;
    toolActivityPreview: string | null;
    workflowId: string;
    workspaceId: string;
  }): Promise<void> {
    await this.database.execute(sql`
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
        metadata,
        started_at,
        created_at,
        updated_at
      )
      VALUES (
        ${randomUUID()},
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
        ${JSON.stringify({ label: input.label })}::jsonb,
        now(),
        now(),
        now()
      )
    `);
  }

  private async completeLatestActivityRound(input: {
    outputPreview: string;
    ownerUserId: string;
    stageTeammateId: string;
    status: "failed" | "pending" | "running" | "succeeded" | "waiting_for_approval";
    workflowId: string;
    workspaceId: string;
  }): Promise<void> {
    await this.database.execute(sql`
      UPDATE activity_rounds
      SET
        output_preview = ${input.outputPreview},
        status = ${input.status},
        ended_at = now(),
        updated_at = now()
      WHERE id = (
        SELECT id
        FROM activity_rounds
        WHERE workflow_id = ${input.workflowId}
          AND owner_user_id = ${input.ownerUserId}
          AND workspace_id = ${input.workspaceId}
          AND acting_teammate_id = ${input.stageTeammateId}
        ORDER BY created_at DESC, id DESC
        LIMIT 1
      )
    `);
  }

  private async recordActorMemory(input: {
    content: string;
    ownerUserId: string;
    teammateId: string;
    title: string;
    workspaceId: string;
  }): Promise<void> {
    await this.database.execute(sql`
      INSERT INTO memory_records (
        id,
        owner_user_id,
        workspace_id,
        teammate_id,
        scope,
        title,
        content,
        source,
        created_at,
        updated_at
      )
      VALUES (
        ${randomUUID()},
        ${input.ownerUserId},
        ${input.workspaceId},
        ${input.teammateId},
        'actor',
        ${input.title},
        ${input.content},
        'actor_self_memory',
        now(),
        now()
      )
    `);
  }

  private async recordWorkspaceMemorySummary(input: {
    content: string;
    ownerUserId: string;
    title: string;
    workflowId: string;
    workspaceId: string;
  }): Promise<void> {
    await this.database.execute(sql`
      INSERT INTO memory_records (
        id,
        owner_user_id,
        workspace_id,
        scope,
        title,
        content,
        source,
        created_at,
        updated_at
      )
      VALUES (
        ${randomUUID()},
        ${input.ownerUserId},
        ${input.workspaceId},
        'workspace',
        ${input.title},
        ${input.content},
        'workflow',
        now(),
        now()
      )
    `);
  }

  private async resolveWorkflowOwner(workflowId: string): Promise<string> {
    const result = await this.database.execute<{ owner_user_id: string }>(sql`
      SELECT owner_user_id
      FROM coding_workflows
      WHERE id = ${workflowId}
      LIMIT 1
    `);

    const ownerUserId = result.rows[0]?.owner_user_id;
    if (!ownerUserId) {
      throw new Error(`Workflow ${workflowId} owner was not found.`);
    }

    return ownerUserId;
  }
}

function buildContextCacheKey(
  conversationId: string,
  workspaceId: string,
  ownerUserId: string
): string {
  return `${workspaceId}:${ownerUserId}:${conversationId}`;
}

function mapStatusLabelToPhase(
  label: OrchestratorStatusEventPayload["label"]
): "approval" | "coordination" | "implementation" | "memory" | "planning" | "qa" | "review" {
  if (label.includes("plan")) {
    return "planning";
  }
  if (label.includes("review")) {
    return "review";
  }
  if (label.includes("qa")) {
    return "qa";
  }
  if (label.includes("execution") || label.includes("completed")) {
    return "implementation";
  }
  return "coordination";
}

function mapOrchestratorStateToActivityStatus(
  state: OrchestratorStatusEventPayload["state"]
): "failed" | "running" | "succeeded" {
  switch (state) {
    case "failed":
      return "failed";
    case "succeeded":
      return "succeeded";
    case "running":
      return "running";
  }
}

type WorkflowExecutionSnapshot = {
  approvalState: "approved" | "pending" | "rejected" | "revision_requested";
  conversationId: string;
  deadline: string | null;
  executionStages: Array<{
    agentId: string;
    name: string;
    role: CodingWorkflowExecutionStageAssignment["role"];
  }>;
  goal: string;
  id: string;
  ownerUserId: string;
  planContent: string;
  planningRole: CodingWorkflowExecutionStageAssignment["role"];
  planningTeammateId: string;
  priority: "high" | "low" | "normal";
  repoContext: string | null;
  runtimeBackend: RuntimeBackend;
  state:
    | "awaiting_user_confirmation"
    | "completed"
    | "execution_running"
    | "plan_pending_approval"
    | "plan_rejected"
    | "plan_revision_requested"
    | "qa_running"
    | "review_running";
  taskSnapshot: CodingWorkflowTask[];
  workspaceId: string;
};

function remapStreamEventMessageIds(events: StreamEvent[], messageId: string): StreamEvent[] {
  return events.map((event) => {
    switch (event.kind) {
      case "conversation.message.started":
        return {
          kind: event.kind,
          payload: {
            messageId
          }
        };
      case "conversation.message.delta":
        return {
          kind: event.kind,
          payload: {
            delta: event.payload.delta,
            messageId
          }
        };
      case "conversation.message.completed":
        return {
          kind: event.kind,
          payload: {
            finalContent: event.payload.finalContent,
            messageId
          }
        };
      case "conversation.status":
        return event;
    }
  });
}

function buildExecutionPrompt(
  workflow: WorkflowExecutionSnapshot,
  stage: WorkflowExecutionSnapshot["executionStages"][number],
  previousResults: Array<{
    content: string;
    name: string;
    role: CodingWorkflowExecutionStageAssignment["role"];
  }>
): string {
  const sections = [
    `用户目标：${workflow.goal}`,
    `已批准计划：\n${workflow.planContent}`,
    `优先级：${workflow.priority}`
  ];

  if (workflow.repoContext?.trim()) {
    sections.push(`仓库或上下文：${workflow.repoContext.trim()}`);
  }

  if (workflow.deadline?.trim()) {
    sections.push(`截止时间：${workflow.deadline.trim()}`);
  }

  if (previousResults.length > 0) {
    sections.push(
      [
        "前序成员输出：",
        ...previousResults.map(
          (result) =>
            `- ${result.name}（${getBuiltInCodingProfileName(result.role)}）\n${result.content}`
        )
      ].join("\n")
    );
  }

  sections.push(buildExecutionInstruction(stage.role));

  return sections.join("\n\n");
}

function buildExecutionInstruction(
  role: CodingWorkflowExecutionStageAssignment["role"]
): string {
  switch (role) {
    case "software_engineer":
      return "请以软件工程师身份执行这份计划，只输出实现结果、关键改动、验证动作和剩余风险。";
    case "code_reviewer":
      return "请以代码评审身份指出风险、回归点、缺失测试和是否建议通过。";
    case "qa_tester":
      return "请以测试工程师身份给出验证路径、执行结果、未覆盖点和最终验收建议。";
    case "tech_lead":
      return "请以技术负责人身份继续推进执行，整理关键决策、协作分工、风险处理和当前交付状态。";
  }
}

function buildExecutionSummary(
  role: CodingWorkflowExecutionStageAssignment["role"],
  agentName: string
): string {
  switch (role) {
    case "software_engineer":
      return `${agentName}正在根据已批准计划进行实现。`;
    case "code_reviewer":
      return `${agentName}正在检查实现结果和潜在风险。`;
    case "qa_tester":
      return `${agentName}正在验证实现和回归风险。`;
    case "tech_lead":
      return `${agentName}正在继续推进执行和风险协调。`;
  }
}

function buildWorkspaceSummary(
  goal: string,
  stageResults: Array<{
    content: string;
    name: string;
    role: CodingWorkflowExecutionStageAssignment["role"];
  }>
): string {
  const sections = [`目标：${goal}`];

  for (const stageResult of stageResults) {
    sections.push(
      `${stageResult.name}（${getBuiltInCodingProfileName(stageResult.role)}）摘要：${stageResult.content || "暂无"}`
    );
  }

  return sections.join("\n\n");
}

function mapExecutionRoleToWorkflowState(
  role: CodingWorkflowExecutionStageAssignment["role"]
): ActiveWorkflowState {
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
  role: CodingWorkflowExecutionStageAssignment["role"]
): OrchestratorStatusEventPayload["label"] {
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

function startTask(taskSnapshot: CodingWorkflowTask[], taskId: string): CodingWorkflowTask[] {
  return taskSnapshot.map((task) =>
    task.id === taskId
      ? {
          ...task,
          state: "in_progress"
        }
      : task
  );
}

function completeTask(taskSnapshot: CodingWorkflowTask[], taskId: string): CodingWorkflowTask[] {
  return taskSnapshot.map((task) =>
    task.id === taskId
      ? {
          ...task,
          state: "done"
        }
      : task
  );
}
