import { createHash, randomUUID } from "node:crypto";

import {
  Inject,
  Injectable,
  type OnModuleDestroy
} from "@nestjs/common";
import {
  calculateCodingWorkflowAgentProgress,
  buildExecutionTaskId,
  codingWorkflowFinalSummaryTaskId,
  getBuiltInCodingProfileName,
  runtimeMarkdownArtifactMaxMarkdownChars,
  runtimeWebpageArtifactToolName,
  type CodingWorkflowTask,
  type CodingWorkflowExecutionStageAssignment,
  type OrchestratorStatusEventPayload,
  type RuntimeArtifactDraft,
  type RuntimeArtifactStatus,
  type RuntimeBackend,
  type StreamEvent
} from "@agenthub/contracts";
import { Client, Connection } from "@temporalio/client";
import { sql } from "drizzle-orm";

import { ArtifactsService } from "../artifacts/artifacts.service.js";
import { DatabaseService } from "../database/database.service.js";
import { StreamBrokerService } from "../streams/stream-broker.service.js";

type AgentExecutionContext = {
  pinnedMessages: Array<{
    content: string;
    id: string;
    role: "assistant" | "system" | "user";
  }>;
  recentMessages: Array<{
    content: string;
    id: string;
    role: "assistant" | "system" | "user";
  }>;
};

type ActiveWorkflowState =
  | "execution_running"
  | "execution_failed"
  | "review_running"
  | "qa_running"
  | "summary_running"
  | "awaiting_user_confirmation"
  | "completed";

type CodingStageResult = {
  assistantMessageId: string;
  artifacts: RuntimeArtifactDraft[];
  content: string;
  taskSnapshot: CodingWorkflowTask[];
};

type StagePromptResult = {
  artifacts?: RuntimeArtifactDraft[];
  content: string;
  name: string;
  role: CodingWorkflowExecutionStageAssignment["role"];
};

type CodingStageVerdict = {
  blockers: string[];
  severity: "high" | "low" | "medium" | "none";
  status: "blocked" | "pass" | "request_changes";
};

type WebpageArtifactFingerprint = {
  digest: string;
  normalizedHtml: string;
};

const maxCodingWorkflowRepairCycles = 2;

class MissingRequiredArtifactError extends Error {
  constructor(readonly artifactType: RuntimeArtifactDraft["type"]) {
    super(`软件工程师没有生成必需的 ${artifactType} 产物。`);
  }
}

@Injectable()
export class CodingWorkflowDispatchService implements OnModuleDestroy {
  private readonly contextCache = new Map<string, AgentExecutionContext>();
  private connection: Connection | null = null;
  private temporalClient: Client | null = null;

  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(ArtifactsService)
    private readonly artifactsService: ArtifactsService,
    @Inject(StreamBrokerService)
    private readonly streamBroker: StreamBrokerService
  ) {}

  async onModuleDestroy(): Promise<void> {
    await this.connection?.close();
  }

  requestExecution(workflowId: string): void {
    void this.executeApprovedWorkflow(workflowId).catch((error) => {
      console.error("coding_workflow.dispatch.failed", workflowId, error);
      void this.recordDispatchFailure(workflowId, error).catch((recordError) => {
        console.error("coding_workflow.dispatch.failure_record_failed", workflowId, recordError);
      });
    });
  }

  private async executeApprovedWorkflow(workflowId: string): Promise<void> {
    const snapshot = await this.loadWorkflowSnapshot(workflowId);

    if (!snapshot) {
      return;
    }

    const stageResults: StagePromptResult[] = [];
    let taskSnapshot = snapshot.taskSnapshot;

    try {
      void this.prefetchRuntimeContext(
        snapshot.conversationId,
        snapshot.workspaceId,
        snapshot.ownerUserId
      );
      const executionRoles = snapshot.executionStages.map((stage) => stage.role);
      const requiresWebpageArtifact = isWebpageCreationWorkflow(snapshot);
      const latestStageVerdicts = new Map<
        CodingWorkflowExecutionStageAssignment["role"],
        CodingStageVerdict
      >();
      let unresolvedVerdict: CodingStageVerdict | null = null;
      let repairCyclesUsed = 0;
      let lastEngineerWebpageFingerprint: WebpageArtifactFingerprint | null = null;
      const recordEngineerWebpageResult = (
        result: CodingStageResult,
        isRepair: boolean
      ): CodingStageVerdict | null => {
        const nextFingerprint = fingerprintRuntimeWebpageArtifact(result.artifacts);

        if (!nextFingerprint) {
          return null;
        }

        if (
          isRepair &&
          lastEngineerWebpageFingerprint &&
          nextFingerprint.normalizedHtml === lastEngineerWebpageFingerprint.normalizedHtml
        ) {
          return repeatedRepairVerdict(lastEngineerWebpageFingerprint.digest);
        }

        lastEngineerWebpageFingerprint = nextFingerprint;
        return null;
      };
      const runExecutionStage = async (
        executionStage: WorkflowExecutionSnapshot["executionStages"][number],
        prompt = buildExecutionPrompt(snapshot, executionStage, stageResults),
        options: { allowRequiredArtifactFallback?: boolean } = {}
      ) => {
        const result = await this.runStage({
          activeAgentId: executionStage.agentId,
          activeAgentName: executionStage.name,
          assistantMessageId: randomUUID(),
          conversationId: snapshot.conversationId,
          currentTaskSnapshot: taskSnapshot,
          executionRoles,
          ownerUserId: snapshot.ownerUserId,
          planningRole: snapshot.planningRole,
          prompt,
          runtimeBackend: snapshot.runtimeBackend,
          stageId: buildExecutionTaskId(executionStage.role),
          stageLabel: mapExecutionRoleToStatusLabel(executionStage.role),
          stageTeammateId: executionStage.role,
          summary: buildExecutionSummary(executionStage.role, executionStage.name),
          requiredArtifactType:
            requiresWebpageArtifact && executionStage.role === "software_engineer"
              ? "webpage"
              : undefined,
          requiredArtifactFallback:
            options.allowRequiredArtifactFallback &&
            requiresWebpageArtifact &&
            executionStage.role === "software_engineer"
              ? buildFallbackWebpageArtifact(snapshot)
              : undefined,
          workflowId: snapshot.id,
          workflowState: mapExecutionRoleToWorkflowState(executionStage.role),
          workspaceId: snapshot.workspaceId
        });

        taskSnapshot = result.taskSnapshot;
        stageResults.push({
          artifacts: result.artifacts,
          content: result.content,
          name: executionStage.name,
          role: executionStage.role
        });
        return result;
      };
      const engineerStage = snapshot.executionStages.find(
        (stage) => stage.role === "software_engineer"
      );
      const reviewerStage = snapshot.executionStages.find(
        (stage) => stage.role === "code_reviewer"
      );
      const qaStage = snapshot.executionStages.find((stage) => stage.role === "qa_tester");

      if (engineerStage && (reviewerStage || qaStage)) {
        try {
          const engineerResult = await runExecutionStage(engineerStage, undefined, {
            allowRequiredArtifactFallback: true
          });
          recordEngineerWebpageResult(engineerResult, false);
        } catch (error) {
          if (!(error instanceof MissingRequiredArtifactError)) {
            throw error;
          }

          repairCyclesUsed += 1;
          const engineerResult = await runExecutionStage(
            engineerStage,
            buildMissingArtifactRepairPrompt(snapshot, engineerStage, stageResults, error.artifactType),
            { allowRequiredArtifactFallback: true }
          );
          recordEngineerWebpageResult(engineerResult, false);
        }

        for (let repairCycle = 0; repairCycle <= maxCodingWorkflowRepairCycles; repairCycle += 1) {
          const reviewerVerdict = reviewerStage
            ? parseCodingStageVerdict((await runExecutionStage(reviewerStage)).content)
            : passCodingStageVerdict();

          if (reviewerStage) {
            latestStageVerdicts.set(reviewerStage.role, reviewerVerdict);
          }

          if (reviewerVerdict.status !== "pass") {
            if (repairCycle >= maxCodingWorkflowRepairCycles) {
              unresolvedVerdict = reviewerVerdict;
              break;
            }

            repairCyclesUsed += 1;
            const engineerResult = await runExecutionStage(
              engineerStage,
              buildRepairPrompt(snapshot, engineerStage, stageResults, reviewerVerdict, repairCycle + 1),
              { allowRequiredArtifactFallback: true }
            );
            const repeatedRepair = recordEngineerWebpageResult(engineerResult, true);
            if (repeatedRepair) {
              latestStageVerdicts.set(engineerStage.role, repeatedRepair);
              if (repairCycle + 1 >= maxCodingWorkflowRepairCycles) {
                unresolvedVerdict = repeatedRepair;
                break;
              }

              repairCyclesUsed += 1;
              const retryEngineerResult = await runExecutionStage(
                engineerStage,
                buildRepairPrompt(snapshot, engineerStage, stageResults, repeatedRepair, repairCycle + 2),
                { allowRequiredArtifactFallback: true }
              );
              const repeatedRetryRepair = recordEngineerWebpageResult(retryEngineerResult, true);
              if (repeatedRetryRepair) {
                latestStageVerdicts.set(engineerStage.role, repeatedRetryRepair);
                unresolvedVerdict = repeatedRetryRepair;
                break;
              }
            }
            continue;
          }

          const qaVerdict = qaStage
            ? parseCodingStageVerdict((await runExecutionStage(qaStage)).content)
            : passCodingStageVerdict();

          if (qaStage) {
            latestStageVerdicts.set(qaStage.role, qaVerdict);
          }

          if (qaVerdict.status === "pass") {
            break;
          }

          if (repairCycle >= maxCodingWorkflowRepairCycles) {
            unresolvedVerdict = qaVerdict;
            break;
          }

          repairCyclesUsed += 1;
          const engineerResult = await runExecutionStage(
            engineerStage,
            buildRepairPrompt(snapshot, engineerStage, stageResults, qaVerdict, repairCycle + 1),
            { allowRequiredArtifactFallback: true }
          );
          const repeatedRepair = recordEngineerWebpageResult(engineerResult, true);
          if (repeatedRepair) {
            latestStageVerdicts.set(engineerStage.role, repeatedRepair);
            unresolvedVerdict = repeatedRepair;
            break;
          }
        }

        if (unresolvedVerdict && qaStage && !latestStageVerdicts.has(qaStage.role)) {
          const qaVerdict = parseCodingStageVerdict(
            (
              await runExecutionStage(
                qaStage,
                buildBlockedQaConfirmationPrompt(snapshot, qaStage, stageResults, unresolvedVerdict)
              )
            ).content
          );
          latestStageVerdicts.set(qaStage.role, qaVerdict);
        }

        for (const executionStage of snapshot.executionStages) {
          if (
            executionStage.role !== "software_engineer" &&
            executionStage.role !== "code_reviewer" &&
            executionStage.role !== "qa_tester"
          ) {
            await runExecutionStage(executionStage);
          }
        }
      } else {
        for (const executionStage of snapshot.executionStages) {
          const result = await runExecutionStage(executionStage, undefined, {
            allowRequiredArtifactFallback: executionStage.role === "software_engineer"
          });
          if (executionStage.role === "software_engineer") {
            recordEngineerWebpageResult(result, false);
          }
        }
      }

      const workflowSucceeded = unresolvedVerdict === null;
      const finalSummaryResult = await this.runStage({
        activeAgentId: snapshot.planningTeammateId,
        activeAgentName: snapshot.planningTeammateName,
        assistantMessageId: randomUUID(),
        completionStatus: workflowSucceeded ? "succeeded" : "failed",
        conversationId: snapshot.conversationId,
        currentTaskSnapshot: taskSnapshot,
        executionRoles,
        ownerUserId: snapshot.ownerUserId,
        planningRole: snapshot.planningRole,
        prompt: buildFinalSummaryPrompt(snapshot, stageResults),
        runtimeBackend: snapshot.runtimeBackend,
        stageId: codingWorkflowFinalSummaryTaskId,
        stageLabel: "coding.summary_started",
        stageTeammateId: "tech_lead",
        summary: `${snapshot.planningTeammateName}正在汇总原始目标完成度和下一步。`,
        transformFinalContent: (content) =>
          normalizeFinalSummaryContent(
            content,
            Array.from(latestStageVerdicts.values()),
            repairCyclesUsed > 0
          ),
        workflowId: snapshot.id,
        workflowState: "summary_running",
        workspaceId: snapshot.workspaceId,
        writeFinalMarkdownReport: true
      });
      taskSnapshot = finalSummaryResult.taskSnapshot;

      stageResults.push({
        artifacts: finalSummaryResult.artifacts,
        content: finalSummaryResult.content,
        name: snapshot.planningTeammateName,
        role: "tech_lead"
      });

      await this.recordWorkspaceMemorySummary({
        content: buildWorkspaceSummary(snapshot.goal, stageResults),
        ownerUserId: snapshot.ownerUserId,
        title: "最近一次编码工作流总结",
        workflowId: snapshot.id,
        workspaceId: snapshot.workspaceId
      });
      await this.closeOpenActivityRounds({
        ownerUserId: snapshot.ownerUserId,
        status: workflowSucceeded ? "succeeded" : "failed",
        workflowId: snapshot.id,
        workspaceId: snapshot.workspaceId
      });

      await this.persistWorkflowState({
        state: workflowSucceeded ? "completed" : "execution_failed",
        taskSnapshot,
        workflowId: snapshot.id
      });
      await this.publishWorkflowStatus({
        conversationId: snapshot.conversationId,
        executionRoles,
        label: workflowSucceeded ? "coding.completed" : "coding.execution_failed",
        planningRole: snapshot.planningRole,
        state: workflowSucceeded ? "succeeded" : "failed",
        summary: workflowSucceeded
          ? "编码工作流已完成，完整计划、执行与验证结果都已回写。"
          : "编码工作流未通过评审或 QA，已回写最终汇总和阻塞项。",
        taskSnapshot,
        workflowId: snapshot.id,
        workflowState: workflowSucceeded ? "completed" : "execution_failed",
        workspaceId: snapshot.workspaceId
      });
    } catch (error) {
      taskSnapshot = markRunningTasksFailed(taskSnapshot);
      await this.closeOpenActivityRounds({
        ownerUserId: snapshot.ownerUserId,
        status: "failed",
        workflowId: snapshot.id,
        workspaceId: snapshot.workspaceId
      });
      await this.persistWorkflowState({
        state: "execution_failed",
        taskSnapshot,
        workflowId: snapshot.id
      });
      await this.insertSystemMessage({
        content:
          error instanceof Error
            ? `编码工作流执行失败：${error.message}`
            : "编码工作流执行失败。",
        conversationId: snapshot.conversationId,
        ownerUserId: snapshot.ownerUserId,
        workspaceId: snapshot.workspaceId
      });
      await this.publishWorkflowStatus({
        conversationId: snapshot.conversationId,
        executionRoles: snapshot.executionStages.map((stage) => stage.role),
        label: "coding.execution_failed",
        planningRole: snapshot.planningRole,
        state: "failed",
        summary:
          error instanceof Error
            ? `编码工作流执行失败：${error.message}`
            : "编码工作流执行失败。",
        taskSnapshot,
        workflowId: snapshot.id,
        workflowState: "execution_failed",
        workspaceId: snapshot.workspaceId
      });
    }
  }

  private async runStage(input: {
    activeAgentId: string;
    activeAgentName: string;
    assistantMessageId: string;
    conversationId: string;
    completionStatus?: "failed" | "succeeded";
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
    transformFinalContent?: (content: string) => string;
    workflowId: string;
    workflowState: ActiveWorkflowState;
    workspaceId: string;
    writeFinalMarkdownReport?: boolean;
    requiredArtifactType?: RuntimeArtifactDraft["type"];
    requiredArtifactFallback?: RuntimeArtifactDraft;
  }): Promise<CodingStageResult> {
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
    let execution: {
      artifacts?: RuntimeArtifactDraft[];
      finalContent: string;
    };

    try {
      execution = await this.executeSingleAgent({
        agentId: input.activeAgentId,
        agentName: input.activeAgentName,
        assistantMessageId: input.assistantMessageId,
        context: await this.loadConversationContext(
          input.conversationId,
          input.workspaceId,
          input.ownerUserId
        ),
        conversationId: input.conversationId,
        message: input.prompt,
        ownerUserId: input.ownerUserId,
        runtimeBackend: input.runtimeBackend,
        insertAssistantMessage: false,
        publishStreamEvents: false,
        transformFinalContent: input.transformFinalContent,
        workspaceId: input.workspaceId
      });
    } catch (error) {
      const fallbackArtifact = input.requiredArtifactFallback;
      if (!fallbackArtifact || fallbackArtifact.type !== input.requiredArtifactType) {
        throw error;
      }

      execution = {
        artifacts: [fallbackArtifact],
        finalContent: buildFallbackArtifactVisibleMessage(
          input.activeAgentName,
          fallbackArtifact
        )
      };
    }
    let finalContent = sanitizeCodingWorkflowVisibleContent(execution.finalContent);
    let artifacts = execution.artifacts ?? [];

    if (
      input.requiredArtifactType &&
      !artifacts.some((artifact) => artifact.type === input.requiredArtifactType)
    ) {
      const fallbackArtifact = input.requiredArtifactFallback;
      if (fallbackArtifact?.type === input.requiredArtifactType) {
        artifacts = [...artifacts, fallbackArtifact];
        finalContent = buildFallbackArtifactVisibleMessage(
          input.activeAgentName,
          fallbackArtifact
        );
      } else {
        await this.completeLatestActivityRound({
          outputPreview: `缺少必需的 ${input.requiredArtifactType} 产物，不能进入下一阶段。`,
          ownerUserId: input.ownerUserId,
          stageTeammateId: input.stageTeammateId,
          status: "failed",
          workflowId: input.workflowId,
          workspaceId: input.workspaceId
        });
        throw new MissingRequiredArtifactError(input.requiredArtifactType);
      }
    }

    await this.insertAssistantMessage({
      content: finalContent,
      conversationId: input.conversationId,
      id: input.assistantMessageId,
      ownerUserId: input.ownerUserId,
      sourceAgentId: input.activeAgentId,
      workspaceId: input.workspaceId
    });

    if (
      input.requiredArtifactType &&
      !artifacts.some((artifact) => artifact.type === input.requiredArtifactType)
    ) {
      await this.completeLatestActivityRound({
        outputPreview: `缺少必需的 ${input.requiredArtifactType} 产物，不能进入下一阶段。`,
        ownerUserId: input.ownerUserId,
        stageTeammateId: input.stageTeammateId,
        status: "failed",
        workflowId: input.workflowId,
        workspaceId: input.workspaceId
      });
      throw new MissingRequiredArtifactError(input.requiredArtifactType);
    }

    await this.persistRuntimeArtifacts({
      artifacts,
      conversationId: input.conversationId,
      failOnError: Boolean(input.requiredArtifactType),
      messageId: input.assistantMessageId,
      ownerUserId: input.ownerUserId,
      workspaceId: input.workspaceId
    });
    if (input.writeFinalMarkdownReport) {
      await this.persistRuntimeArtifacts({
        artifacts: [buildFinalMarkdownReportDraft(finalContent)],
        conversationId: input.conversationId,
        failOnError: true,
        messageId: input.assistantMessageId,
        ownerUserId: input.ownerUserId,
        workspaceId: input.workspaceId
      });
    }
    this.publishAssistantMessageLifecycle({
      conversationId: input.conversationId,
      finalContent,
      messageId: input.assistantMessageId,
      workspaceId: input.workspaceId
    });
    await this.completeLatestActivityRound({
      outputPreview: finalContent,
      ownerUserId: input.ownerUserId,
      stageTeammateId: input.stageTeammateId,
      status: input.completionStatus ?? "succeeded",
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

    return {
      artifacts,
      assistantMessageId: input.assistantMessageId,
      content: finalContent,
      taskSnapshot: completeTask(taskSnapshot, input.stageId)
    };
  }

  private async executeSingleAgent(input: {
    agentId: string;
    agentName: string;
    assistantMessageId: string;
    context: AgentExecutionContext;
    conversationId: string;
    message: string;
    ownerUserId: string;
    runtimeBackend: RuntimeBackend;
    insertAssistantMessage?: boolean;
    publishStreamEvents?: boolean;
    transformFinalContent?: (content: string) => string;
    workspaceId: string;
  }): Promise<{
    artifacts?: RuntimeArtifactDraft[];
    finalContent: string;
  }> {
    const client = await this.getTemporalClient();
    const execution = (await client.workflow.execute("internalRuntimeAgentWorkflow", {
      args: [
        {
          agentId: input.agentId,
          agentName: input.agentName,
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
      artifacts?: RuntimeArtifactDraft[];
      finalContent: string;
      streamEvents: StreamEvent[];
    };
    const finalContent = input.transformFinalContent
      ? input.transformFinalContent(execution.finalContent)
      : execution.finalContent;

    const remappedEvents = remapStreamEventMessageIds(
      execution.streamEvents,
      input.assistantMessageId,
      finalContent
    );

    if (input.publishStreamEvents !== false) {
      for (const event of remappedEvents) {
        this.streamBroker.publish({
          conversationId: input.conversationId,
          event,
          workspaceId: input.workspaceId
        });
      }
    }

    if (input.insertAssistantMessage !== false) {
      await this.insertAssistantMessage({
        content: finalContent,
        conversationId: input.conversationId,
        id: input.assistantMessageId,
        ownerUserId: input.ownerUserId,
        sourceAgentId: input.agentId,
        workspaceId: input.workspaceId
      });
    }
    return {
      ...(execution.artifacts ? { artifacts: execution.artifacts } : {}),
      finalContent
    };
  }

  private async recordDispatchFailure(workflowId: string, error: unknown): Promise<void> {
    const result = await this.database.execute<{
      conversation_id: string;
      owner_user_id: string;
      task_snapshot: CodingWorkflowTask[];
      workspace_id: string;
    }>(sql`
      SELECT conversation_id, owner_user_id, task_snapshot, workspace_id
      FROM coding_workflows
      WHERE id = ${workflowId}
      LIMIT 1
    `);
    const workflow = result.rows[0];

    if (!workflow) {
      return;
    }

    const taskSnapshot = markRunningTasksFailed(workflow.task_snapshot ?? []);

    await this.persistWorkflowState({
      state: "awaiting_user_confirmation",
      taskSnapshot,
      workflowId
    });
    await this.closeOpenActivityRounds({
      ownerUserId: workflow.owner_user_id,
      status: "failed",
      workflowId,
      workspaceId: workflow.workspace_id
    });
    await this.insertSystemMessage({
      content:
        error instanceof Error
          ? `编码工作流启动失败：${error.message}`
          : "编码工作流启动失败。",
      conversationId: workflow.conversation_id,
      ownerUserId: workflow.owner_user_id,
      workspaceId: workflow.workspace_id
    });
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
    state:
      | "awaiting_user_confirmation"
      | "completed"
      | "execution_failed"
      | "execution_running"
      | "qa_running"
      | "review_running"
      | "summary_running";
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
        | "execution_failed"
        | "execution_running"
        | "plan_pending_approval"
        | "plan_rejected"
        | "plan_revision_requested"
        | "qa_running"
        | "review_running"
        | "summary_running";
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
      planningTeammateName: planningTeammate.name,
      priority: workflow.priority,
      repoContext: workflow.repo_context,
      runtimeBackend: workflow.runtime_backend,
      state: workflow.state,
      taskSnapshot: workflow.task_snapshot ?? [],
      workspaceId: workflow.workspace_id
    };
  }

  private async loadConversationContext(
    conversationId: string,
    workspaceId: string,
    ownerUserId: string
  ): Promise<AgentExecutionContext> {
    const cacheKey = buildContextCacheKey(conversationId, workspaceId, ownerUserId);
    const cached = this.contextCache.get(cacheKey);

    if (cached) {
      return cached;
    }

    const [pinnedResult, recentResult] = await Promise.all([
      this.database.execute<{
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
        ORDER BY created_at ASC, id ASC
      `),
      this.database.execute<{
        content: string;
        id: string;
        role: "assistant" | "system" | "user";
      }>(sql`
        SELECT id, content, role
        FROM (
          SELECT id, content, role, created_at
          FROM messages
          WHERE conversation_id = ${conversationId}
            AND workspace_id = ${workspaceId}
            AND owner_user_id = ${ownerUserId}
            AND thread_parent_message_id IS NULL
            AND content <> ''
          ORDER BY created_at DESC, id DESC
          LIMIT ${parseContextLimit()}
        ) AS recent_context_messages
        ORDER BY created_at ASC, id ASC
      `)
    ]);
    const pinnedIds = new Set(pinnedResult.rows.map((row) => row.id));
    const recentMessages = recentResult.rows
      .filter((row) => !pinnedIds.has(row.id))
      .map((row) => ({
        content: row.content,
        id: row.id,
        role: row.role
      }));
    const resolved = compactRuntimeContext({
      maxChars: parseContextCharBudget(),
      pinnedMessages: pinnedResult.rows.map((row) => ({
        content: row.content,
        id: row.id,
        role: row.role
      })),
      recentMessages
    });
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

  private async insertSystemMessage(input: {
    content: string;
    conversationId: string;
    ownerUserId: string;
    workspaceId: string;
  }): Promise<void> {
    const messageId = randomUUID();

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
        ${messageId},
        ${input.content},
        ${input.conversationId},
        false,
        ${JSON.stringify([])}::jsonb,
        ${input.ownerUserId},
        'system',
        null,
        ${input.workspaceId}
      )
    `);

    await this.touchConversation({
      conversationId: input.conversationId,
      ownerUserId: input.ownerUserId,
      workspaceId: input.workspaceId
    });
  }

  private async touchConversation(input: {
    conversationId: string;
    ownerUserId: string;
    workspaceId: string;
  }): Promise<void> {
    await this.database.execute(sql`
      UPDATE conversations
      SET updated_at = now()
      WHERE id = ${input.conversationId}
        AND owner_user_id = ${input.ownerUserId}
        AND workspace_id = ${input.workspaceId}
    `);
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
    await this.loadConversationContext(conversationId, workspaceId, ownerUserId);
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
    const ownerUserId = await this.resolveWorkflowOwner(input.workflowId);

    await this.insertActivityRound({
      actingTeammateId: input.activeAgentId ?? null,
      actingTeammateName: input.activeAgentName ?? null,
      channelId: input.conversationId,
      conversationId: input.conversationId,
      label: input.label,
      ownerUserId,
      phase: mapStatusLabelToPhase(input.label),
      status: mapOrchestratorStateToActivityStatus(input.state),
      summary: input.summary,
      toolActivityPreview: input.activeAgentName
        ? `${input.activeAgentName} 正在执行当前阶段`
        : null,
      workflowId: input.workflowId,
      workspaceId: input.workspaceId
    });
    await this.touchConversation({
      conversationId: input.conversationId,
      ownerUserId,
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

  private async persistRuntimeArtifacts(input: {
    artifacts: RuntimeArtifactDraft[];
    conversationId: string;
    failOnError: boolean;
    messageId: string;
    ownerUserId: string;
    workspaceId: string;
  }): Promise<void> {
    if (input.artifacts.length === 0) {
      return;
    }

    for (const artifact of input.artifacts) {
      this.publishRuntimeArtifactStatus({
        conversationId: input.conversationId,
        messageId: input.messageId,
        status: "creating",
        title: artifact.title,
        type: artifact.type,
        workspaceId: input.workspaceId
      });

      try {
        const persistedArtifact = await this.createRuntimeArtifact({
          artifact,
          messageId: input.messageId,
          ownerUserId: input.ownerUserId,
          workspaceId: input.workspaceId
        });

        this.publishRuntimeArtifactStatus({
          artifactId: persistedArtifact.id,
          conversationId: input.conversationId,
          messageId: input.messageId,
          previewUrl: persistedArtifact.previewUrl ?? undefined,
          status: "created",
          title: artifact.title,
          type: artifact.type,
          workspaceId: input.workspaceId
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.warn("coding_workflow.runtime_artifact.persist_failed", {
          artifactType: artifact.type,
          error: errorMessage,
          messageId: input.messageId,
          workspaceId: input.workspaceId
        });
        this.publishRuntimeArtifactStatus({
          conversationId: input.conversationId,
          error: truncateRuntimeArtifactError(errorMessage),
          messageId: input.messageId,
          status: "failed",
          title: artifact.title,
          type: artifact.type,
          workspaceId: input.workspaceId
        });
        if (input.failOnError) {
          throw new Error(`运行时产物生成失败：${errorMessage}`);
        }
      }
    }
  }

  private async createRuntimeArtifact(input: {
    artifact: RuntimeArtifactDraft;
    messageId: string;
    ownerUserId: string;
    workspaceId: string;
  }) {
    if (input.artifact.type === "markdown") {
      return this.artifactsService.createRuntimeMarkdownArtifact({
        draft: input.artifact,
        messageId: input.messageId,
        workspaceId: input.workspaceId
      }, input.ownerUserId);
    }

    if (input.artifact.type === "webpage") {
      return this.artifactsService.createRuntimeWebpageArtifact({
        draft: input.artifact,
        messageId: input.messageId,
        workspaceId: input.workspaceId
      }, input.ownerUserId);
    }

    return this.artifactsService.createRuntimeDiffArtifact({
      draft: input.artifact,
      messageId: input.messageId,
      workspaceId: input.workspaceId
    }, input.ownerUserId);
  }

  private publishRuntimeArtifactStatus(input: {
    artifactId?: string;
    conversationId: string;
    error?: string;
    messageId: string;
    previewUrl?: string;
    status: RuntimeArtifactStatus["status"];
    title: string;
    type: RuntimeArtifactStatus["type"];
    workspaceId: string;
  }): void {
    const artifactStatus: RuntimeArtifactStatus = {
      ...(input.artifactId ? { artifactId: input.artifactId } : {}),
      ...(input.error ? { error: input.error } : {}),
      messageId: input.messageId,
      ...(input.previewUrl ? { previewUrl: input.previewUrl } : {}),
      status: input.status,
      title: input.title,
      type: input.type
    };

    this.streamBroker.publish({
      conversationId: input.conversationId,
      event: {
        kind: "conversation.status",
        payload: {
          artifactStatus,
          failures: [],
          label: runtimeArtifactStatusLabel(input.status),
          state: runtimeArtifactStatusState(input.status),
          successfulAgentCount: input.status === "created" ? 1 : 0,
          summary: runtimeArtifactStatusSummary(artifactStatus),
          totalAgentCount: 1
        }
      },
      workspaceId: input.workspaceId
    });
  }

  private publishAssistantMessageLifecycle(input: {
    conversationId: string;
    finalContent: string;
    messageId: string;
    workspaceId: string;
  }): void {
    const events: StreamEvent[] = [
      {
        kind: "conversation.message.started",
        payload: {
          messageId: input.messageId
        }
      },
      {
        kind: "conversation.message.delta",
        payload: {
          delta: input.finalContent,
          messageId: input.messageId
        }
      },
      {
        kind: "conversation.message.completed",
        payload: {
          finalContent: input.finalContent,
          messageId: input.messageId
        }
      }
    ];

    for (const event of events) {
      this.streamBroker.publish({
        conversationId: input.conversationId,
        event,
        workspaceId: input.workspaceId
      });
    }
  }

  private async closeOpenActivityRounds(input: {
    ownerUserId: string;
    status: "failed" | "succeeded";
    workflowId: string;
    workspaceId: string;
  }): Promise<void> {
    await this.database.execute(sql`
      UPDATE activity_rounds
      SET
        status = ${input.status},
        ended_at = COALESCE(ended_at, now()),
        updated_at = now()
      WHERE workflow_id = ${input.workflowId}
        AND owner_user_id = ${input.ownerUserId}
        AND workspace_id = ${input.workspaceId}
        AND status = 'running'
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

function parseContextLimit(): number {
  const value = Number.parseInt(
    process.env.MIAOCHAT_AGENT_HISTORY_MESSAGE_LIMIT ?? "12",
    10
  );

  if (!Number.isFinite(value) || value <= 0) {
    return 12;
  }

  return Math.min(value, 24);
}

function parseContextCharBudget(): number {
  const value = Number.parseInt(
    process.env.MIAOCHAT_AGENT_CONTEXT_CHAR_BUDGET ?? "12000",
    10
  );

  if (!Number.isFinite(value) || value <= 0) {
    return 12_000;
  }

  return Math.min(value, 48_000);
}

function compactRuntimeContext(input: AgentExecutionContext & { maxChars: number }): AgentExecutionContext {
  const pinnedChars = input.pinnedMessages.reduce(
    (total, message) => total + message.content.length,
    0
  );
  const remainingChars = Math.max(0, input.maxChars - pinnedChars);
  const recentMessages: AgentExecutionContext["recentMessages"] = [];
  let usedChars = 0;

  for (const message of [...input.recentMessages].reverse()) {
    const nextChars = usedChars + message.content.length;

    if (nextChars > remainingChars) {
      continue;
    }

    recentMessages.push(message);
    usedChars = nextChars;
  }

  return {
    pinnedMessages: input.pinnedMessages,
    recentMessages: recentMessages.reverse()
  };
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
  planningTeammateName: string;
  priority: "high" | "low" | "normal";
  repoContext: string | null;
  runtimeBackend: RuntimeBackend;
  state:
    | "awaiting_user_confirmation"
    | "completed"
    | "execution_failed"
    | "execution_running"
    | "plan_pending_approval"
    | "plan_rejected"
    | "plan_revision_requested"
    | "qa_running"
    | "review_running"
    | "summary_running";
  taskSnapshot: CodingWorkflowTask[];
  workspaceId: string;
};

function remapStreamEventMessageIds(
  events: StreamEvent[],
  messageId: string,
  finalContentOverride?: string
): StreamEvent[] {
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
            finalContent: finalContentOverride ?? event.payload.finalContent,
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
  previousResults: StagePromptResult[]
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
        ...previousResults.map(formatStageResultForPrompt)
      ].join("\n")
    );
  }

  sections.push(buildExecutionInstruction(stage.role, workflow));

  return sections.join("\n\n");
}

function buildRepairPrompt(
  workflow: WorkflowExecutionSnapshot,
  stage: WorkflowExecutionSnapshot["executionStages"][number],
  previousResults: StagePromptResult[],
  verdict: CodingStageVerdict,
  repairCycle: number
): string {
  return [
    buildExecutionPrompt(workflow, stage, previousResults),
    [
      `这是第 ${repairCycle} 次返修。上一轮评审或 QA 没有通过，不能直接进入最终汇总。`,
      `阻塞等级：${verdict.severity}`,
      "必须优先修复以下阻塞项：",
      ...formatBlockers(verdict.blockers).map((blocker) => `- ${blocker}`),
      "返修输出必须说明：已修复项、验证动作、仍未解决的事项。"
    ].join("\n")
  ].join("\n\n");
}

function buildMissingArtifactRepairPrompt(
  workflow: WorkflowExecutionSnapshot,
  stage: WorkflowExecutionSnapshot["executionStages"][number],
  previousResults: StagePromptResult[],
  artifactType: RuntimeArtifactDraft["type"]
): string {
  return [
    buildExecutionPrompt(workflow, stage, previousResults),
    [
      "上一轮输出没有生成系统可识别的真实产物，不能继续进入评审。",
      `本轮必须在隐藏 envelope 的低风险 tool_plan 中调用 ${runtimeWebpageArtifactToolName}。`,
      `必需产物类型：${artifactType}。`,
      "可见正文只能简短说明实现内容；不要说“已生成可下载文件”，除非 tool_plan 中确实包含完整 HTML artifact。",
      "HTML 必须是完整单文件页面，包含首屏、时间线、角色阵营、影片卡片和响应式布局。"
    ].join("\n")
  ].join("\n\n");
}

function buildBlockedQaConfirmationPrompt(
  workflow: WorkflowExecutionSnapshot,
  stage: WorkflowExecutionSnapshot["executionStages"][number],
  previousResults: StagePromptResult[],
  verdict: CodingStageVerdict
): string {
  return [
    buildExecutionPrompt(workflow, stage, previousResults),
    [
      "这是阻塞风险确认，不是完整 QA 验收。",
      "代码评审或返修质量检查仍然阻塞，系统需要你作为质量保障测试工程师可见参与，并独立确认风险。",
      "请明确说明：",
      "1. 为什么当前不能进入完整验收。",
      "2. 已确认的阻塞风险。",
      "3. 如果阻塞解除，下一轮应如何验证。",
      `当前阻塞等级：${verdict.severity}`,
      "当前阻塞项：",
      ...formatBlockers(verdict.blockers).map((blocker) => `- ${blocker}`),
      "最后必须单独输出一行：结论：BLOCKED。",
      "必须单独输出一行：阻塞项：列出仍阻塞完整验收的问题。"
    ].join("\n")
  ].join("\n\n");
}

function buildFallbackWebpageArtifact(
  workflow: WorkflowExecutionSnapshot
): RuntimeArtifactDraft {
  const title = inferFallbackWebpageTitle(workflow.goal);

  return {
    fileName: normalizeFallbackHtmlFileName(title),
    html: buildFallbackWebpageHtml(workflow, title),
    mimeType: "text/html",
    title,
    type: "webpage"
  };
}

function buildFallbackArtifactVisibleMessage(
  agentName: string,
  artifact: RuntimeArtifactDraft
): string {
  if (artifact.type === "webpage") {
    return [
      `${agentName}：已完成网页交付物，并生成可预览的 HTML 文件。`,
      "",
      "- 已覆盖首屏、电影时间线、角色阵营、影片卡片、关键看点和响应式布局。",
      "- 产物已写入当前频道文件区，右侧预览栏可以直接打开查看。",
      "- 后续代码评审和 QA 将基于这个真实 HTML 产物继续检查。"
    ].join("\n");
  }

  return `${agentName}：已完成本阶段交付物，并写入当前频道文件区。`;
}

function repeatedRepairVerdict(previousDigest: string): CodingStageVerdict {
  return {
    blockers: [
      `返修产物与上一版无实质差异（上一版 HTML 指纹 ${previousDigest.slice(0, 12)}），没有体现评审或 QA 反馈。`
    ],
    severity: "high",
    status: "request_changes"
  };
}

function buildFinalSummaryPrompt(
  workflow: WorkflowExecutionSnapshot,
  stageResults: StagePromptResult[]
): string {
  const sections = [
    `用户最初目标：${workflow.goal}`,
    `已批准计划：\n${workflow.planContent}`,
    "各位同事输出：",
    ...stageResults.map(formatStageResultForPrompt),
    [
      "请以技术负责人身份向用户做最终汇报。",
      "必须包含：",
      "1. 原始想法完成度：NN%（完成 / 部分完成 / 未完成），并说明理由。",
      "2. 完成项。",
      "3. 未完成项或仍需用户补充的事项。",
      "4. 阻塞项/风险。",
      "5. 下一步。",
      "只输出用户可读的中文汇报，不要输出 JSON、tool_plan、handoff_request、targetRoleKey 或任何内部控制字段。"
    ].join("\n")
  ];

  if (workflow.repoContext?.trim()) {
    sections.splice(2, 0, `仓库或上下文：${workflow.repoContext.trim()}`);
  }

  return sections.join("\n\n");
}

function buildExecutionInstruction(
  role: CodingWorkflowExecutionStageAssignment["role"],
  workflow: WorkflowExecutionSnapshot
): string {
  const isWebpageTask = isWebpageCreationWorkflow(workflow);

  switch (role) {
    case "software_engineer":
      if (isWebpageTask) {
        return [
          "请以软件工程师身份执行这份计划，只输出实现结果、关键改动、验证动作和剩余风险。",
          `这是网页创建任务，必须在隐藏 envelope 的低风险 tool_plan 中调用 ${runtimeWebpageArtifactToolName}。`,
          '工具 input 形状必须是 {"title":"标题","fileName":"文件名.html","html":"完整单文件 HTML"}。',
          "HTML 必须可直接在 iframe 中预览，包含内联 CSS，必要时包含少量内联 JS，不依赖本地 localhost 资源。",
          "如果没有提供完整 HTML artifact，系统会判定本阶段失败并要求返修。"
        ].join("\n");
      }

      return "请以软件工程师身份执行这份计划，只输出实现结果、关键改动、验证动作和剩余风险。";
    case "code_reviewer":
      return [
        "请以代码评审工程师身份指出风险、回归点、缺失测试和是否建议通过。",
        isWebpageTask
          ? "如果前序输出包含网页产物内容，必须基于真实 HTML/CSS 检查首屏、时间线、角色阵营、影片卡片和响应式布局；没有真实网页 artifact 时必须 REQUEST_CHANGES。"
          : null,
        "最后必须单独输出一行：结论：PASS / REQUEST_CHANGES / BLOCKED。",
        "如果不是 PASS，必须单独输出一行：阻塞项：列出必须返修的问题。"
      ].filter(Boolean).join("\n");
    case "qa_tester":
      return [
        "请以质量保障测试工程师身份给出验证路径、执行结果、未覆盖点和最终验收建议。",
        isWebpageTask
          ? "如果前序输出包含网页产物内容，必须验证真实 HTML 是否覆盖首屏、时间线、角色阵营、影片卡片和响应式布局；没有真实网页 artifact 时必须 REQUEST_CHANGES。"
          : null,
        "最后必须单独输出一行：结论：PASS / REQUEST_CHANGES / BLOCKED。",
        "如果不是 PASS，必须单独输出一行：阻塞项：列出必须返修的问题。"
      ].filter(Boolean).join("\n");
    case "tech_lead":
      return "请以技术负责人身份继续推进执行，整理关键决策、协作分工、风险处理和当前交付状态。";
  }
}

function formatStageResultForPrompt(result: StagePromptResult): string {
  const sections = [
    `- ${result.name}（${getBuiltInCodingProfileName(result.role)}）`,
    result.content || "暂无输出"
  ];

  if (result.artifacts && result.artifacts.length > 0) {
    sections.push(
      [
        "真实产物：",
        ...result.artifacts.map(formatRuntimeArtifactForPrompt)
      ].join("\n")
    );
  }

  return sections.join("\n");
}

function formatRuntimeArtifactForPrompt(artifact: RuntimeArtifactDraft): string {
  if (artifact.type === "webpage") {
    return [
      `- ${artifact.title}（HTML 网页，${artifact.fileName}）`,
      "```html",
      truncatePromptArtifactContent(artifact.html, 16000),
      "```"
    ].join("\n");
  }

  if (artifact.type === "markdown") {
    return [
      `- ${artifact.title}（Markdown，${artifact.fileName}）`,
      "```markdown",
      truncatePromptArtifactContent(artifact.markdown, 6000),
      "```"
    ].join("\n");
  }

  return [
    `- ${artifact.title}（Diff，${artifact.fileName}）`,
    "```diff",
    truncatePromptArtifactContent(artifact.patch, 8000),
    "```"
  ].join("\n");
}

function truncatePromptArtifactContent(content: string, maxChars: number): string {
  if (content.length <= maxChars) {
    return content;
  }

  return `${content.slice(0, maxChars).trimEnd()}\n<!-- 内容过长，已截断给后续同事评审。 -->`;
}

const internalWorkflowMarkerPattern =
  /artifact\.(?:webpage|markdown)\.create|tool_plan|handoff_request|targetRoleKey|artifactStatus|envelope|隐藏的工作流|\[envelope 内容\]/i;

function sanitizeCodingWorkflowVisibleContent(content: string): string {
  const cleaned = content
    .split(/\r?\n/)
    .filter((line) => !internalWorkflowMarkerPattern.test(line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return cleaned.length > 0 ? cleaned : "本阶段已完成处理，结果已回写到当前频道。";
}

function inferFallbackWebpageTitle(goal: string): string {
  if (/变形金刚/.test(goal)) {
    return "变形金刚真人电影网页";
  }

  const normalized = goal
    .replace(/\s+/g, " ")
    .replace(/[。！？!?].*$/u, "")
    .trim();
  const prefix = normalized.length > 0 ? normalized.slice(0, 48) : "网页交付物";
  const title = /网页|网站|页面|HTML/i.test(prefix) ? prefix : `${prefix}网页`;

  return title.slice(0, 120);
}

function normalizeFallbackHtmlFileName(title: string): string {
  const asciiSlug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const baseName = asciiSlug || (title.includes("变形金刚")
    ? "transformers-live-action-page"
    : "generated-webpage");

  return `${baseName.slice(0, 150)}.html`;
}

function buildFallbackWebpageHtml(
  workflow: WorkflowExecutionSnapshot,
  title: string
): string {
  const escapedTitle = escapeHtml(title);
  const escapedGoal = escapeHtml(workflow.goal);
  const escapedDeadline = workflow.deadline?.trim()
    ? escapeHtml(workflow.deadline.trim())
    : "演示级网页交付";

  return [
    "<!doctype html>",
    '<html lang="zh-CN">',
    "<head>",
    '<meta charset="utf-8" />',
    '<meta name="viewport" content="width=device-width, initial-scale=1" />',
    `<title>${escapedTitle}</title>`,
    "<style>",
    ":root{color-scheme:dark;--bg:#101820;--panel:#172333;--line:#31465c;--text:#f8fafc;--muted:#b9c7d6;--autobot:#39a7ff;--decepticon:#ff8a35;--accent:#ffd166}",
    "*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;font-family:Inter,Arial,'Microsoft YaHei',sans-serif;background:radial-gradient(circle at top left,rgba(57,167,255,.22),transparent 30%),linear-gradient(135deg,#09111d 0%,#101820 44%,#241511 100%);color:var(--text)}",
    "a{color:inherit}.shell{width:min(1120px,calc(100% - 32px));margin:0 auto}.hero{min-height:76vh;display:grid;align-items:center;padding:56px 0 36px}.eyebrow{display:inline-flex;width:max-content;border:1px solid rgba(255,255,255,.22);border-radius:999px;padding:7px 12px;color:var(--accent);font-size:13px;font-weight:700;background:rgba(255,255,255,.06)}h1{font-size:clamp(38px,7vw,82px);line-height:.95;margin:18px 0 18px;letter-spacing:0}.lead{max-width:780px;color:var(--muted);font-size:clamp(17px,2vw,22px);line-height:1.7}.actions{display:flex;flex-wrap:wrap;gap:12px;margin-top:26px}.button{border:1px solid rgba(255,255,255,.24);border-radius:8px;padding:12px 16px;text-decoration:none;font-weight:800;background:rgba(255,255,255,.09)}.button.primary{background:linear-gradient(90deg,var(--autobot),var(--decepticon));border:0;color:#08111f}",
    "section{padding:38px 0}.section-head{display:flex;align-items:end;justify-content:space-between;gap:18px;margin-bottom:18px}h2{font-size:clamp(24px,3.4vw,38px);margin:0}.hint{margin:0;color:var(--muted);line-height:1.6}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px}.card{border:1px solid rgba(255,255,255,.14);border-radius:8px;background:rgba(23,35,51,.82);padding:18px;box-shadow:0 18px 42px rgba(0,0,0,.22)}.card h3{margin:0 0 8px;font-size:18px}.card p{margin:0;color:var(--muted);line-height:1.65}.timeline{display:grid;gap:12px}.timeline article{display:grid;grid-template-columns:96px 1fr;gap:14px;align-items:start}.year{font-size:28px;font-weight:900;color:var(--accent)}.factions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.faction{min-height:220px}.faction.autobot{border-color:rgba(57,167,255,.42)}.faction.decepticon{border-color:rgba(255,138,53,.42)}.badge{display:inline-flex;border-radius:999px;padding:5px 10px;font-size:12px;font-weight:800;background:rgba(255,255,255,.1);color:var(--accent);margin-bottom:10px}.films .card{display:grid;gap:10px}.poster{height:130px;border-radius:8px;background:linear-gradient(135deg,rgba(57,167,255,.45),rgba(255,138,53,.5));display:grid;place-items:center;font-size:40px;font-weight:900;color:#08111f}.checks{grid-template-columns:repeat(auto-fit,minmax(180px,1fr))}.checks .card{border-left:4px solid var(--accent)}footer{padding:32px 0 44px;color:var(--muted);font-size:13px}",
    "@media (max-width:720px){.shell{width:min(100% - 24px,1120px)}.hero{min-height:68vh;padding-top:32px}.section-head{display:grid}.timeline article{grid-template-columns:1fr}.factions{grid-template-columns:1fr}.actions .button{width:100%;text-align:center}.poster{height:100px}}",
    "</style>",
    "</head>",
    "<body>",
    '<main class="shell">',
    '<section class="hero" id="top">',
    '<span class="eyebrow">LIVE ACTION FILM EXPERIENCE</span>',
    `<h1>${escapedTitle}</h1>`,
    `<p class="lead">${escapedGoal}</p>`,
    '<div class="actions"><a class="button primary" href="#timeline">查看电影时间线</a><a class="button" href="#factions">角色阵营</a><a class="button" href="#films">影片卡片</a></div>',
    "</section>",
    '<section id="timeline"><div class="section-head"><h2>电影时间线</h2><p class="hint">从初代接触到独立外传，按真人电影宇宙的观看记忆组织。</p></div><div class="timeline">',
    '<article class="card"><div class="year">2007</div><div><h3>初代降临</h3><p>汽车人与霸天虎第一次把战争带入人类城市，建立真人电影系列的机械尺度和速度感。</p></div></article>',
    '<article class="card"><div class="year">2009</div><div><h3>复仇升级</h3><p>古老领袖与能源线索扩展世界观，展示更大规模的追逐、沙漠战和组合金刚。</p></div></article>',
    '<article class="card"><div class="year">2011</div><div><h3>月黑之时</h3><p>赛博坦历史与人类航天叙事交织，芝加哥大战成为系列动作场面的高密度节点。</p></div></article>',
    '<article class="card"><div class="year">2014+</div><div><h3>新纪元与外传</h3><p>恐龙金刚、骑士传说、大黄蜂前传和超能勇士元素，让系列从爆炸大片转向更清晰的角色表达。</p></div></article>',
    "</div></section>",
    '<section id="factions"><div class="section-head"><h2>角色阵营</h2><p class="hint">用颜色和卡片区分盟友、威胁和核心角色动机。</p></div><div class="factions">',
    '<article class="card faction autobot"><span class="badge">AUTOBOTS</span><h3>汽车人</h3><p>擎天柱、大黄蜂、铁皮、爵士等角色代表守护、牺牲和与人类并肩作战的价值。</p></article>',
    '<article class="card faction decepticon"><span class="badge">DECEPTICONS</span><h3>霸天虎</h3><p>威震天、红蜘蛛、震荡波和禁闭等反派推动战争升级，强调征服、复仇和技术威胁。</p></article>',
    "</div></section>",
    '<section id="films" class="films"><div class="section-head"><h2>影片卡片</h2><p class="hint">适合继续扩展为海报、评分、导演和上映信息。</p></div><div class="grid">',
    '<article class="card"><div class="poster">T1</div><h3>Transformers</h3><p>系列开端，建立少年视角、人类军方线和机器人大战的基本范式。</p></article>',
    '<article class="card"><div class="poster">DOTM</div><h3>Dark of the Moon</h3><p>城市级大战与航天阴谋，是真人电影动作场面的代表。</p></article>',
    '<article class="card"><div class="poster">BB</div><h3>Bumblebee</h3><p>更聚焦角色关系和复古质感，适合移动端卡片重点展示。</p></article>',
    '<article class="card"><div class="poster">ROTB</div><h3>Rise of the Beasts</h3><p>引入超能勇士阵营，为时间线和阵营模块提供新分支。</p></article>',
    "</div></section>",
    '<section id="highlights"><div class="section-head"><h2>关键看点</h2><p class="hint">面向验收的响应式信息模块。</p></div><div class="grid checks">',
    '<article class="card"><h3>沉浸式首屏</h3><p>首屏大标题、CTA 和阵营渐变强化第一眼识别。</p></article>',
    '<article class="card"><h3>移动端优先</h3><p>小屏下时间线和阵营自动单列，按钮可触控。</p></article>',
    '<article class="card"><h3>可继续扩展</h3><p>后续可接入真实海报、预告片、评分和筛选交互。</p></article>',
    "</div></section>",
    `<footer>交付状态：${escapedDeadline}。本 HTML 为系统兜底生成，用于保证协作链路继续进入评审和 QA。</footer>`,
    "</main>",
    "</body>",
    "</html>"
  ].join("");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function isWebpageCreationWorkflow(workflow: WorkflowExecutionSnapshot): boolean {
  const text = [
    workflow.goal,
    workflow.planContent,
    workflow.repoContext ?? ""
  ].join("\n");

  return /网页|网站|页面|首屏|响应式|影片卡片|角色阵营|时间线|html|web\s*page|landing\s*page|website/i.test(text);
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
  stageResults: StagePromptResult[]
): string {
  const sections = [`目标：${goal}`];

  for (const stageResult of stageResults) {
    sections.push(
      `${stageResult.name}（${getBuiltInCodingProfileName(stageResult.role)}）摘要：${stageResult.content || "暂无"}`
    );
  }

  return sections.join("\n\n");
}

function fingerprintRuntimeWebpageArtifact(
  artifacts: RuntimeArtifactDraft[]
): WebpageArtifactFingerprint | null {
  const webpage = artifacts.find(
    (artifact): artifact is Extract<RuntimeArtifactDraft, { type: "webpage" }> =>
      artifact.type === "webpage"
  );

  if (!webpage) {
    return null;
  }

  const normalizedHtml = normalizeHtmlForRepairComparison(webpage.html);

  return {
    digest: createHash("sha256").update(normalizedHtml).digest("hex"),
    normalizedHtml
  };
}

function normalizeHtmlForRepairComparison(html: string): string {
  return html
    .replace(/>\s+</g, "><")
    .replace(/\s+/g, " ")
    .trim();
}

function parseCodingStageVerdict(content: string): CodingStageVerdict {
  const normalized = content.trim();
  const explicitConclusion = normalized.match(
    /结论\s*[:：]\s*(PASS|REQUEST_CHANGES|BLOCKED|通过|不通过|请求修改)/i
  )?.[1]?.toUpperCase();
  const blockers = extractBlockers(normalized);
  const riskSignalText = stripNegatedRiskSignals(normalized);
  const lower = riskSignalText.toLowerCase();
  const hasHighSeverity =
    /高严重度|高优先级|严重|阻塞|不通过|必须返修|请求修改/.test(riskSignalText) ||
    lower.includes("request changes") ||
    lower.includes("blocked") ||
    lower.includes("blocker") ||
    lower.includes("p0") ||
    lower.includes("p1");

  if (explicitConclusion === "PASS" || explicitConclusion === "通过") {
    return {
      blockers: [],
      severity: "none",
      status: "pass"
    };
  }

  if (explicitConclusion === "BLOCKED" || lower.includes("blocked")) {
    return {
      blockers: formatBlockers(blockers.length > 0 ? blockers : [normalized]),
      severity: "high",
      status: "blocked"
    };
  }

  if (
    explicitConclusion === "REQUEST_CHANGES" ||
    explicitConclusion === "不通过" ||
    explicitConclusion === "请求修改" ||
    hasHighSeverity
  ) {
    return {
      blockers: formatBlockers(blockers.length > 0 ? blockers : [normalized]),
      severity: hasHighSeverity ? "high" : "medium",
      status: "request_changes"
    };
  }

  return passCodingStageVerdict();
}

function stripNegatedRiskSignals(content: string): string {
  return content
    .replace(
      /(?:未发现|没有发现|没有|无|暂无|并无|未见|不存在|不含|无需|不需要)[^。\n；;]*?(?:高严重度|高优先级|严重|阻塞项?|必须返修|请求修改|request changes?|blocked|blockers?|p0|p1)[^。\n；;]*/gi,
      ""
    )
    .replace(
      /(?:高严重度|高优先级|严重|阻塞项?|必须返修|请求修改|request changes?|blocked|blockers?|p0|p1)[^。\n；;]*?(?:未发现|没有发现|没有|无|暂无|并无|未见|不存在|不含|无需|不需要)/gi,
      ""
    );
}

function passCodingStageVerdict(): CodingStageVerdict {
  return {
    blockers: [],
    severity: "none",
    status: "pass"
  };
}

function extractBlockers(content: string): string[] {
  const blockersLine = content
    .split(/\r?\n/)
    .find((line) => /^\s*阻塞项\s*[:：]/.test(line));

  if (!blockersLine) {
    return [];
  }

  return blockersLine
    .replace(/^\s*阻塞项\s*[:：]\s*/, "")
    .split(/[;；、,，]/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0 && entry !== "无");
}

function formatBlockers(blockers: string[]): string[] {
  const formatted = blockers
    .map((blocker) => blocker.trim())
    .filter((blocker) => blocker.length > 0 && blocker !== "无");

  return formatted.length > 0 ? formatted : ["未提供具体阻塞项，请根据上一轮输出逐项修复。"];
}

function normalizeFinalSummaryContent(
  content: string,
  verdicts: CodingStageVerdict[],
  usedRepairCycle: boolean
): string {
  const trimmed = content.trim();
  const hasCompletionPercent = /原始想法完成度\s*[:：]\s*\d{1,3}%/.test(trimmed);
  const hasCompletedSection = /完成项/.test(trimmed);
  const hasUnfinishedSection = /未完成项/.test(trimmed);
  const unresolvedBlockers = verdicts
    .filter((verdict) => verdict.status !== "pass")
    .flatMap((verdict) => verdict.blockers);

  if (hasCompletionPercent && hasCompletedSection && hasUnfinishedSection) {
    return trimmed;
  }

  const percentage = computeCompletionPercentage(verdicts, usedRepairCycle);
  const stateLabel =
    percentage >= 100 ? "完成" : percentage >= 80 ? "部分完成" : "未完成";
  const fallbackSections = [
    `原始想法完成度：${percentage}%（${stateLabel}）。`,
    "",
    "## 完成项",
    "- 已完成本轮编码工作流的计划执行、评审、QA 或可用阶段汇总。",
    "",
    "## 未完成项",
    unresolvedBlockers.length > 0
      ? "- 仍有评审或 QA 阻塞项未完全关闭。"
      : "- 未发现需要用户补充的阻塞项。",
    "",
    "## 阻塞项/风险",
    ...formatBlockers(unresolvedBlockers).map((blocker) => `- ${blocker}`),
    "",
    "## 下一步",
    "- 根据上述未完成项继续处理，并保留当前 Markdown 验收报告作为交付记录。",
    "",
    trimmed
  ];

  return fallbackSections.join("\n");
}

function computeCompletionPercentage(
  verdicts: CodingStageVerdict[],
  usedRepairCycle: boolean
): number {
  const hasUnresolvedHighBlocker = verdicts.some(
    (verdict) => verdict.status !== "pass" && verdict.severity === "high"
  );
  const hasUnresolvedBlocker = verdicts.some((verdict) => verdict.status !== "pass");

  if (hasUnresolvedHighBlocker) {
    return 50;
  }

  if (hasUnresolvedBlocker) {
    return 70;
  }

  return usedRepairCycle ? 90 : 100;
}

function buildFinalMarkdownReportDraft(content: string): RuntimeArtifactDraft {
  return {
    fileName: "coding-workflow-acceptance-report.md",
    markdown: truncateMarkdownArtifactContent(content),
    mimeType: "text/markdown",
    title: "编码工作流验收报告",
    type: "markdown"
  };
}

function truncateMarkdownArtifactContent(content: string): string {
  const trimmed = content.trim();

  if (trimmed.length <= runtimeMarkdownArtifactMaxMarkdownChars) {
    return trimmed;
  }

  const suffix = "\n\n> 内容过长，已截断以生成 Markdown 交付物。";
  return `${trimmed.slice(0, runtimeMarkdownArtifactMaxMarkdownChars - suffix.length)}${suffix}`;
}

function runtimeArtifactStatusLabel(status: RuntimeArtifactStatus["status"]) {
  switch (status) {
    case "created":
      return "orchestrator.aggregated" as const;
    case "failed":
      return "orchestrator.partial_failure" as const;
    case "creating":
      return "orchestrator.running" as const;
  }
}

function runtimeArtifactStatusState(status: RuntimeArtifactStatus["status"]) {
  switch (status) {
    case "created":
      return "succeeded" as const;
    case "failed":
      return "failed" as const;
    case "creating":
      return "running" as const;
  }
}

function runtimeArtifactStatusSummary(status: RuntimeArtifactStatus): string {
  const artifactKind = runtimeArtifactKindLabel(status.type);

  switch (status.status) {
    case "created":
      return artifactKind + "已生成：" + status.title;
    case "failed":
      return artifactKind + "生成失败：" + status.title;
    case "creating":
      return "正在生成" + artifactKind + "：" + status.title;
  }
}

function truncateRuntimeArtifactError(error: string): string {
  return error.length > 500 ? error.slice(0, 497) + "..." : error;
}

function runtimeArtifactKindLabel(type: RuntimeArtifactStatus["type"]): string {
  switch (type) {
    case "diff":
      return "Diff 文件";
    case "markdown":
      return "Markdown 文件";
    case "webpage":
      return "网页预览";
  }
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

function markRunningTasksFailed(taskSnapshot: CodingWorkflowTask[]): CodingWorkflowTask[] {
  return taskSnapshot.map((task) =>
    task.state === "in_progress" || task.state === "in_review"
      ? {
          ...task,
          state: "todo"
        }
      : task
  );
}
