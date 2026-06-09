import { randomUUID } from "node:crypto";

import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
  type OnModuleDestroy
} from "@nestjs/common";

import {
  createMessageInputSchema,
  runtimeMarkdownArtifactMaxMarkdownChars,
  sanitizeAssistantVisibleContent,
  sanitizeAssistantVisibleStreamEvents,
  type Message,
  type OrchestratorStatusEventPayload,
  type ProviderId,
  type RuntimeArtifactDraft,
  type RuntimeArtifactStatus,
  type StreamEvent,
  type VisualWorkflow
} from "@agenthub/contracts";
import { mapToPublicError } from "@agenthub/domain";
import {
  buildCollaborationPlan,
  selectInitialOrchestratorTargets,
  type OrchestratorState
} from "@agenthub/domain/orchestration";
import { Client, Connection } from "@temporalio/client";
import { z } from "zod";

import { ConversationsRepository } from "../conversations/conversations.repository.js";
import { RateLimitService } from "../limits/rate-limit.service.js";
import { MultiAgentHarnessService } from "../multi-agent-harness/multi-agent-harness.service.js";
import { MetricsRegistry } from "../../observability/metrics-registry.service.js";
import { StructuredLogger } from "../../observability/structured-logger.service.js";
import { TraceRecorder } from "../../observability/trace-recorder.service.js";
import { StreamBrokerService } from "../streams/stream-broker.service.js";
import { ArtifactsService } from "../artifacts/artifacts.service.js";
import { CodingWorkflowsService } from "../coding-workflows/coding-workflows.service.js";
import { WorkspacePermissionGuard } from "../workspaces/permission.guard.js";
import { VisualWorkflowsService } from "../visual-workflows/visual-workflows.service.js";
import { MessagesService } from "./messages.service.js";
import { PinMessageService } from "./pin-message.service.js";

const resolvedConversationAgentSchema = z.object({
  agentId: z.string().min(1),
  agentName: z.string().min(1),
  capabilityTags: z.array(z.string().min(1)).default([]),
  modelProfileId: z.string().min(1).nullable().optional(),
  outputStyle: z.string().min(1).nullable().optional(),
  participantId: z.string().min(1).optional(),
  provider: z.custom<ProviderId>((value) => typeof value === "string" && value.length > 0),
  scopeDescription: z.string().nullable().optional(),
  systemPrompt: z.string().min(1).nullable().optional()
});

const resolvedConversationSchema = z.object({
  agents: z.array(resolvedConversationAgentSchema),
  mode: z.enum(["direct", "group"])
});

type MessageDispatchResponse = Message & {
  launchedWorkflow?: VisualWorkflow;
};

@Injectable()
export class MessageDispatchService implements OnModuleDestroy {
  private connection: Connection | null = null;
  private temporalClient: Client | null = null;

  constructor(
    @Inject(ConversationsRepository)
    private readonly conversationsRepository: ConversationsRepository,
    @Inject(MessagesService) private readonly messagesService: MessagesService,
    @Inject(MetricsRegistry) private readonly metrics: MetricsRegistry,
    @Inject(MultiAgentHarnessService)
    private readonly multiAgentHarnessService: MultiAgentHarnessService,
    @Inject(PinMessageService) private readonly pinMessageService: PinMessageService,
    @Inject(RateLimitService) private readonly rateLimitService: RateLimitService,
    @Inject(StreamBrokerService) private readonly streamBroker: StreamBrokerService,
    @Inject(StructuredLogger) private readonly logger: StructuredLogger,
    @Inject(TraceRecorder) private readonly traceRecorder: TraceRecorder,
    @Optional()
    @Inject(ArtifactsService)
    private readonly artifactsService?: ArtifactsService,
    @Optional()
    @Inject(CodingWorkflowsService)
    private readonly codingWorkflowsService?: CodingWorkflowsService,
    @Optional()
    @Inject(WorkspacePermissionGuard)
    private readonly workspacePermissionGuard?: WorkspacePermissionGuard,
    @Optional()
    @Inject(VisualWorkflowsService)
    private readonly visualWorkflowsService?: VisualWorkflowsService
  ) {}

  async onModuleDestroy(): Promise<void> {
    await this.connection?.close();
  }

  async send(input: unknown, ownerUserId: string): Promise<MessageDispatchResponse> {
    const parsed = createMessageInputSchema.parse(input);

    if (parsed.role !== "user") {
      throw new BadRequestException("Only user-authored messages can be dispatched.");
    }

    const rateLimitKey = `messages.send:${parsed.workspaceId}:${parsed.conversationId}`;
    const rateLimit = await this.rateLimitService.consume({ key: rateLimitKey });

    if (!rateLimit.allowed) {
      this.metrics.incrementCounter("messages_send_rate_limited_total", {
        workspaceId: parsed.workspaceId
      });
      this.logger.warn("messages.send.rate_limited", {
        conversationId: parsed.conversationId,
        retryAfterMs: rateLimit.retryAfterMs,
        workspaceId: parsed.workspaceId
      });

      const publicError = mapToPublicError({
        code: "rate_limited",
        message: "rate limit"
      });
      throw new HttpException(
        {
          code: publicError.code,
          message: publicError.message,
          retryAfterMs: rateLimit.retryAfterMs
        },
        HttpStatus.TOO_MANY_REQUESTS
      );
    }

    const sendAccess = await this.messagesService.resolveSendAccess({
      actorUserId: ownerUserId,
      conversationId: parsed.conversationId,
      workspaceId: parsed.workspaceId
    });
    const workflowCreationIntent =
      parsed.mentionedAgentIds.length === 0
        ? parseVisualWorkflowCreationIntent(parsed.content)
        : null;

    const userMessage = await this.messagesService.create(parsed, ownerUserId, sendAccess);

    if (workflowCreationIntent) {
      if (!this.visualWorkflowsService) {
        throw new BadRequestException("Workflow 服务暂时不可用。");
      }

      const launchedWorkflow = await this.visualWorkflowsService.createFromMessage({
        content: parsed.content,
        conversationId: parsed.conversationId,
        ownerUserId: sendAccess.ownerUserId,
        sourceMessageId: userMessage.id,
        workspaceId: parsed.workspaceId
      });

      return {
        ...userMessage,
        launchedWorkflow
      };
    }

    const resolvedConversation = await this.resolveConversation(
      parsed.conversationId,
      parsed.workspaceId,
      sendAccess.ownerUserId
    );

    if (resolvedConversation.agents.length === 0) {
      return userMessage;
    }

    if (resolvedConversation.mode === "direct") {
      const directAgent = resolvedConversation.agents[0];

      if (!directAgent) {
        throw new NotFoundException(
          `No agent binding found for conversation ${parsed.conversationId} in workspace ${parsed.workspaceId}`
        );
      }

      this.runDetachedDispatch(
        this.dispatchDirectAssistantReply({
          agentId: directAgent.agentId,
          agentName: directAgent.agentName,
          conversationId: parsed.conversationId,
          message: parsed.content,
          mentionedAgentIds: userMessage.mentionedAgentIds,
          modelProfileId: directAgent.modelProfileId,
          ownerUserId: sendAccess.ownerUserId,
          outputStyle: directAgent.outputStyle,
          provider: directAgent.provider,
          scopeDescription: directAgent.scopeDescription,
          systemPrompt: directAgent.systemPrompt,
          userMessageId: userMessage.id,
          workspaceId: parsed.workspaceId
        })
      );
    } else {
      const initialTargets = selectInitialOrchestratorTargets({
        mentionedAgentIds: userMessage.mentionedAgentIds,
        targets: resolvedConversation.agents
      });

      this.runDetachedDispatch(
        this.dispatchGroupAssistantReply({
          conversationId: parsed.conversationId,
          initialTargetAgentIds: initialTargets.map((target) => target.agentId),
          lockInitialTargets: userMessage.mentionedAgentIds.length > 0,
          message: parsed.content,
          mentionedAgentIds: userMessage.mentionedAgentIds,
          ownerUserId: sendAccess.ownerUserId,
          targets: resolvedConversation.agents,
          userMessageId: userMessage.id,
          workspaceId: parsed.workspaceId
        })
      );
    }

    return userMessage;
  }

  private async dispatchDirectAssistantReply(input: {
    agentId: string;
    agentName: string;
    conversationId: string;
    message: string;
    mentionedAgentIds: string[];
    modelProfileId?: string | null;
    ownerUserId: string;
    outputStyle?: string | null;
    provider: ProviderId;
    scopeDescription?: string | null;
    systemPrompt?: string | null;
    userMessageId: string;
    workspaceId: string;
  }): Promise<void> {
    const span = this.traceRecorder.startSpan("provider.dispatch.direct", {
      agentId: input.agentId,
      conversationId: input.conversationId,
      provider: input.provider,
      workspaceId: input.workspaceId
    });
    this.metrics.incrementCounter("provider_dispatch_total", {
      mode: "direct",
      provider: input.provider
    });
    const directRun = {
      agentId: input.agentId,
      provider: input.provider,
      reason: resolveHumanTriggeredRunReason(input.mentionedAgentIds, input.agentId)
    };

    try {
      const context = await this.pinMessageService.loadConversationContext(
        input.conversationId,
        input.workspaceId,
        input.ownerUserId,
        { excludeMessageId: input.userMessageId }
      );
      const client = await this.getTemporalClient();
      await this.multiAgentHarnessService.recordAgentRunsStarted?.({
        channelId: input.conversationId,
        ownerUserId: input.ownerUserId,
        runs: [directRun],
        userMessageId: input.userMessageId,
        workspaceId: input.workspaceId
      });
      const execution = (await client.workflow.execute("singleAgentWorkflow", {
        args: [
          {
            ...input,
            context
          }
        ],
        taskQueue: process.env.WORKER_TASK_QUEUE ?? "agenthub-default",
        workflowId: `single-agent:${input.conversationId}:${randomUUID()}`
      })) as {
        artifacts?: RuntimeArtifactDraft[];
        finalContent: string;
        runtimeMetadata?: Record<string, unknown>;
        streamEvents: StreamEvent[];
      };
      const visibleFinalContent = sanitizeAssistantVisibleContent(execution.finalContent);
      const assistantMessageId = randomUUID();
      const streamEvents = remapStreamEventMessageIds(
        execution.streamEvents,
        assistantMessageId,
        visibleFinalContent
      );

      const assistantMessage = await this.messagesService.createAssistantMessage({
        content: visibleFinalContent,
        conversationId: input.conversationId,
        id: assistantMessageId,
        ownerUserId: input.ownerUserId,
        sourceAgentId: input.agentId,
        workspaceId: input.workspaceId
      });
      await this.persistRuntimeArtifacts({
        artifacts: execution.artifacts,
        message: assistantMessage,
        ownerUserId: input.ownerUserId
      });
      await this.multiAgentHarnessService.recordDirectExecution({
        assistantMessage,
        artifactCount: execution.artifacts?.length ?? 0,
        channelId: input.conversationId,
        mentionedAgentIds: input.mentionedAgentIds,
        ownerUserId: input.ownerUserId,
        result: {
          agentId: input.agentId,
          agentName: input.agentName,
          finalContent: visibleFinalContent,
          outputStyle: input.outputStyle,
          provider: input.provider,
          runtimeMetadata: execution.runtimeMetadata ?? {},
          scopeDescription: input.scopeDescription,
          systemPrompt: input.systemPrompt
        },
        userMessageId: input.userMessageId,
        workspaceId: input.workspaceId
      });
      for (const event of streamEvents) {
        this.streamBroker.publish({
          conversationId: input.conversationId,
          event,
          workspaceId: input.workspaceId
        });
      }

      this.metrics.incrementCounter("provider_dispatch_success_total", {
        mode: "direct",
        provider: input.provider
      });
      span.end({ assistantMessageId });
    } catch (error) {
      await this.recordAgentRunFailureCheckpoint({
        channelId: input.conversationId,
        error,
        mode: "direct",
        ownerUserId: input.ownerUserId,
        provider: input.provider,
        runs: [directRun],
        userMessageId: input.userMessageId,
        workspaceId: input.workspaceId
      });
      await this.createVisibleDispatchFailureMessage({
        agentId: input.agentId,
        content: formatDirectDispatchFailureNotice(error),
        conversationId: input.conversationId,
        ownerUserId: input.ownerUserId,
        workspaceId: input.workspaceId
      });
      this.metrics.incrementCounter("provider_dispatch_error_total", {
        mode: "direct",
        provider: input.provider
      });
      this.logger.error("provider.dispatch.failed", {
        agentId: input.agentId,
        conversationId: input.conversationId,
        error: error instanceof Error ? error.message : String(error),
        mode: "direct",
        workspaceId: input.workspaceId
      });
      span.fail(error);
      throw error;
    }
  }

  private async dispatchGroupAssistantReply(input: {
    conversationId: string;
    initialTargetAgentIds: string[];
    lockInitialTargets: boolean;
    message: string;
    mentionedAgentIds: string[];
    ownerUserId: string;
    targets: Array<z.infer<typeof resolvedConversationAgentSchema>>;
    userMessageId: string;
    workspaceId: string;
  }): Promise<void> {
    const providerLabel = summarizeProviders(input.targets);
    const span = this.traceRecorder.startSpan("provider.dispatch.group", {
      conversationId: input.conversationId,
      provider: providerLabel,
      targetAgentCount: input.targets.length,
      workspaceId: input.workspaceId
    });
    this.metrics.incrementCounter("provider_dispatch_total", {
      mode: "group",
      provider: providerLabel
    });
    const plannedGroupRuns = buildPlannedGroupRunDescriptors(input);
    const groupDispatchStartedAt = Date.now();
    let groupProgressHeartbeat: ReturnType<typeof setInterval> | null = null;

    try {
      const context = await this.pinMessageService.loadConversationContext(
        input.conversationId,
        input.workspaceId,
        input.ownerUserId,
        { excludeMessageId: input.userMessageId }
      );
      const client = await this.getTemporalClient();
      await this.multiAgentHarnessService.recordAgentRunsStarted?.({
        channelId: input.conversationId,
        ownerUserId: input.ownerUserId,
        runs: plannedGroupRuns,
        userMessageId: input.userMessageId,
        workspaceId: input.workspaceId
      });
      this.publishGroupProgressStatus({
        input,
        label: "orchestrator.dispatched",
        plannedGroupRuns,
        startedAt: groupDispatchStartedAt
      });
      groupProgressHeartbeat = setInterval(() => {
        this.publishGroupProgressStatus({
          input,
          label: "orchestrator.running",
          plannedGroupRuns,
          startedAt: groupDispatchStartedAt
        });
      }, 15_000);
      const execution = (await client.workflow.execute("groupOrchestratorWorkflow", {
        args: [
          {
            context,
            conversationId: input.conversationId,
            initialTargetAgentIds: input.initialTargetAgentIds,
            lockInitialTargets: input.lockInitialTargets,
            message: input.message,
            ownerUserId: input.ownerUserId,
            targets: input.targets,
            workspaceId: input.workspaceId
          }
        ],
        taskQueue: process.env.WORKER_TASK_QUEUE ?? "agenthub-default",
        workflowId: `group-orchestrator:${input.conversationId}:${randomUUID()}`
      })) as {
        finalContent: string;
        state: OrchestratorState;
        streamEvents: StreamEvent[];
      };
      if (groupProgressHeartbeat) {
        clearInterval(groupProgressHeartbeat);
        groupProgressHeartbeat = null;
      }
      const streamEvents = sanitizeAssistantVisibleStreamEvents(execution.streamEvents);

      for (const event of streamEvents) {
        if (event.kind !== "conversation.status") {
          continue;
        }

        this.metrics.incrementCounter("orchestrator_state_total", {
          label: event.payload.label,
          state: event.payload.state
        });

        this.streamBroker.publish({
          conversationId: input.conversationId,
          event,
          workspaceId: input.workspaceId
        });
      }

      const assistantMessages: Array<{
        message: Message;
        result: OrchestratorState["results"][number];
      }> = [];
      const markdownFallback = buildGroupMarkdownFallback({
        finalContent: execution.finalContent,
        message: input.message,
        results: execution.state.results
      });
      const markdownFallbackResultIndex =
        markdownFallback && execution.state.results.length > 0
          ? execution.state.results.length - 1
          : -1;

      for (let index = 0; index < execution.state.results.length; index += 1) {
        const result = execution.state.results[index];

        if (!result) {
          continue;
        }

        const visibleResult = {
          ...result,
          finalContent: sanitizeAssistantVisibleContent(result.finalContent, {
            stripCollaborationPlaceholders: true
          })
        };
        const resultArtifacts = [
          ...(visibleResult.artifacts ?? []),
          ...(index === markdownFallbackResultIndex && markdownFallback
            ? [markdownFallback]
            : [])
        ];
        const visibleResultWithArtifacts = {
          ...visibleResult,
          ...(resultArtifacts.length > 0 ? { artifacts: resultArtifacts } : {})
        };
        const assistantMessage = await this.messagesService.createAssistantMessage({
          content: visibleResultWithArtifacts.finalContent,
          conversationId: input.conversationId,
          id: randomUUID(),
          ownerUserId: input.ownerUserId,
          sourceAgentId: result.agentId,
          workspaceId: input.workspaceId
        });
        await this.persistRuntimeArtifacts({
          artifacts: visibleResultWithArtifacts.artifacts,
          message: assistantMessage,
          ownerUserId: input.ownerUserId
        });
        assistantMessages.push({
          message: assistantMessage,
          result: visibleResultWithArtifacts
        });
      }

      await this.multiAgentHarnessService.recordGroupExecution({
        assistantMessages,
        channelId: input.conversationId,
        initialTargetAgentIds: input.initialTargetAgentIds,
        mentionedAgentIds: input.mentionedAgentIds,
        ownerUserId: input.ownerUserId,
        targets: input.targets,
        userMessageId: input.userMessageId,
        workspaceId: input.workspaceId
      });

      if (execution.state.failures.length > 0) {
        await this.multiAgentHarnessService.recordAgentRunsFailed?.({
          channelId: input.conversationId,
          errorCode: "provider_dispatch_failed",
          errorMessage: summarizeGroupFailures(execution.state.failures),
          ownerUserId: input.ownerUserId,
          runs: buildFailedGroupRunDescriptors(input, execution.state.failures),
          userMessageId: input.userMessageId,
          workspaceId: input.workspaceId
        });
      }

      const completionMessages = assistantMessages.map((entry) => entry.message);

      if (execution.state.failures.length > 0) {
        const failureMessage = await this.messagesService.createAssistantMessage({
          content: formatGroupFailureNotice(execution.state),
          conversationId: input.conversationId,
          id: randomUUID(),
          ownerUserId: input.ownerUserId,
          sourceAgentId: null,
          workspaceId: input.workspaceId
        });
        completionMessages.push(failureMessage);
      }

      for (const message of completionMessages) {
        this.streamBroker.publish({
          conversationId: input.conversationId,
          event: createAssistantCompletedEvent(message),
          workspaceId: input.workspaceId
        });
      }

      this.metrics.incrementCounter("provider_dispatch_success_total", {
        mode: "group",
        provider: providerLabel
      });
      span.end({
        assistantMessageId: completionMessages[0]?.id,
        assistantMessageIds: completionMessages.map((message) => message.id)
      });
    } catch (error) {
      if (groupProgressHeartbeat) {
        clearInterval(groupProgressHeartbeat);
      }
      await this.recordAgentRunFailureCheckpoint({
        channelId: input.conversationId,
        error,
        mode: "group",
        ownerUserId: input.ownerUserId,
        provider: providerLabel,
        runs: plannedGroupRuns,
        userMessageId: input.userMessageId,
        workspaceId: input.workspaceId
      });
      await this.createVisibleDispatchFailureMessage({
        agentId: null,
        content: formatGroupDispatchFailureNotice(error),
        conversationId: input.conversationId,
        ownerUserId: input.ownerUserId,
        workspaceId: input.workspaceId
      });
      this.metrics.incrementCounter("provider_dispatch_error_total", {
        mode: "group",
        provider: providerLabel
      });
      this.logger.error("provider.dispatch.failed", {
        conversationId: input.conversationId,
        error: error instanceof Error ? error.message : String(error),
        mode: "group",
        workspaceId: input.workspaceId
      });
      span.fail(error);
      throw error;
    }
  }

  private async recordAgentRunFailureCheckpoint(input: {
    channelId: string;
    error: unknown;
    mode: "direct" | "group";
    ownerUserId: string;
    provider: string;
    runs: Array<{
      agentId: string;
      provider: ProviderId;
      reason: "human_mention" | "scheduled_followup";
      turnKey?: string;
    }>;
    userMessageId: string;
    workspaceId: string;
  }): Promise<void> {
    try {
      await this.multiAgentHarnessService.recordAgentRunsFailed?.({
        channelId: input.channelId,
        errorCode: "provider_dispatch_failed",
        errorMessage: errorMessageForCheckpoint(input.error),
        ownerUserId: input.ownerUserId,
        runs: input.runs,
        userMessageId: input.userMessageId,
        workspaceId: input.workspaceId
      });
    } catch (ledgerError) {
      this.logger.warn("provider.dispatch.ledger_failed", {
        error: ledgerError instanceof Error ? ledgerError.message : String(ledgerError),
        mode: input.mode,
        provider: input.provider,
        workspaceId: input.workspaceId
      });
    }
  }

  private publishGroupProgressStatus(input: {
    input: {
      conversationId: string;
      targets: Array<z.infer<typeof resolvedConversationAgentSchema>>;
      workspaceId: string;
    };
    label: "orchestrator.dispatched" | "orchestrator.running";
    plannedGroupRuns: Array<{
      agentId: string;
      provider: ProviderId;
      reason: "human_mention" | "scheduled_followup";
      turnKey: string;
    }>;
    startedAt: number;
  }): void {
    this.streamBroker.publish({
      conversationId: input.input.conversationId,
      event: {
        kind: "conversation.status",
        payload: buildGroupProgressStatusPayload(input)
      },
      workspaceId: input.input.workspaceId
    });
  }

  private async createVisibleDispatchFailureMessage(input: {
    agentId: string | null;
    content: string;
    conversationId: string;
    ownerUserId: string;
    workspaceId: string;
  }): Promise<void> {
    try {
      const failureMessage = await this.messagesService.createAssistantMessage({
        content: input.content,
        conversationId: input.conversationId,
        id: randomUUID(),
        ownerUserId: input.ownerUserId,
        sourceAgentId: input.agentId,
        workspaceId: input.workspaceId
      });

      this.streamBroker.publish({
        conversationId: input.conversationId,
        event: createAssistantCompletedEvent(failureMessage),
        workspaceId: input.workspaceId
      });
    } catch (error) {
      this.logger.warn("provider.dispatch.failure_message_failed", {
        conversationId: input.conversationId,
        error: error instanceof Error ? error.message : String(error),
        workspaceId: input.workspaceId
      });
    }
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

  private async resolveConversation(
    conversationId: string,
    workspaceId: string,
    ownerUserId: string
  ): Promise<z.infer<typeof resolvedConversationSchema>> {
    const result = await this.conversationsRepository.listConversationAgentsWithProviders(
      conversationId,
      workspaceId,
      ownerUserId
    );

    if (result.length === 0) {
      const conversation = await this.conversationsRepository.findConversation(
        conversationId,
        workspaceId,
        ownerUserId
      );

      if (!conversation) {
        throw new NotFoundException(
          `Conversation ${conversationId} was not found in workspace ${workspaceId}`
        );
      }

      return resolvedConversationSchema.parse({
        agents: [],
        mode: conversation.mode
      });
    }

    return resolvedConversationSchema.parse({
      agents: result.map((row) => ({
        agentId: row.agent_id,
        agentName: row.agent_name,
        capabilityTags: row.capability_tags ?? [],
        modelProfileId: row.model_profile_id,
        outputStyle: row.output_style,
        participantId: row.agent_id,
        provider: row.provider,
        scopeDescription: row.scope_description,
        systemPrompt: row.system_prompt
      })),
      mode: result[0]?.mode
    });
  }

  private runDetachedDispatch(dispatchPromise: Promise<void>): void {
    // The dispatch routine already records metrics and logs failures internally.
    void dispatchPromise.catch(() => {});
  }

  private async persistRuntimeArtifacts(input: {
    artifacts?: RuntimeArtifactDraft[];
    message: Message;
    ownerUserId: string;
  }): Promise<void> {
    if (!input.artifacts || input.artifacts.length === 0) {
      return;
    }

    for (const artifact of input.artifacts) {
      if (!this.artifactsService) {
        this.publishRuntimeArtifactStatus({
          error: "Artifact service is unavailable.",
          message: input.message,
          status: "failed",
          title: artifact.title,
          type: artifact.type
        });
        continue;
      }

      this.publishRuntimeArtifactStatus({
        message: input.message,
        status: "creating",
        title: artifact.title,
        type: artifact.type
      });

      try {
        const persistedArtifact = await this.createRuntimeArtifact({
          artifact,
          messageId: input.message.id,
          ownerUserId: input.ownerUserId,
          workspaceId: input.message.workspaceId
        });
        this.publishRuntimeArtifactStatus({
          artifactId: persistedArtifact.id,
          message: input.message,
          previewUrl: persistedArtifact.previewUrl ?? undefined,
          status: "created",
          title: artifact.title,
          type: artifact.type
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger.warn("messages.runtime_artifact.persist_failed", {
          artifactType: artifact.type,
          error: errorMessage,
          messageId: input.message.id,
          workspaceId: input.message.workspaceId
        });
        this.publishRuntimeArtifactStatus({
          error: truncateRuntimeArtifactError(errorMessage),
          message: input.message,
          status: "failed",
          title: artifact.title,
          type: artifact.type
        });
      }
    }
  }

  private async createRuntimeArtifact(input: {
    artifact: RuntimeArtifactDraft;
    messageId: string;
    ownerUserId: string;
    workspaceId: string;
  }) {
    if (!this.artifactsService) {
      throw new Error("Artifact service is unavailable.");
    }

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
    error?: string;
    message: Message;
    previewUrl?: string;
    status: RuntimeArtifactStatus["status"];
    title: string;
    type: RuntimeArtifactStatus["type"];
  }): void {
    const artifactStatus: RuntimeArtifactStatus = {
      ...(input.artifactId ? { artifactId: input.artifactId } : {}),
      ...(input.error ? { error: input.error } : {}),
      messageId: input.message.id,
      ...(input.previewUrl ? { previewUrl: input.previewUrl } : {}),
      status: input.status,
      title: input.title,
      type: input.type
    };

    this.streamBroker.publish({
      conversationId: input.message.conversationId,
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
      workspaceId: input.message.workspaceId
    });
  }
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
  const artifactKind = status.type === "diff" ? "Diff 文件" : "Markdown 文件";

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

function buildPlannedGroupRunDescriptors(input: {
  initialTargetAgentIds: string[];
  lockInitialTargets: boolean;
  message: string;
  mentionedAgentIds: string[];
  targets: Array<z.infer<typeof resolvedConversationAgentSchema>>;
  userMessageId: string;
}): Array<{
  agentId: string;
  provider: ProviderId;
  reason: "human_mention" | "scheduled_followup";
  turnKey: string;
}> {
  const initialTargets = resolveInitialGroupTargets(input);

  if (initialTargets.length === 0) {
    return [];
  }

  const collaborationPlan = input.lockInitialTargets
    ? {
        maxRounds: 1,
        order: initialTargets,
        totalSteps: initialTargets.length
      }
    : buildCollaborationPlan({
        message: input.message,
        targets: initialTargets
      });
  const totalSteps =
    collaborationPlan.totalSteps ??
    collaborationPlan.maxRounds * collaborationPlan.order.length;

  return Array.from({ length: totalSteps }).flatMap((_, turnIndex) => {
    const target = collaborationPlan.order[turnIndex % collaborationPlan.order.length];

    if (!target) {
      return [];
    }

    return [
      {
        agentId: target.agentId,
        provider: target.provider,
        reason: resolveHumanTriggeredRunReason(input.mentionedAgentIds, target.agentId),
        turnKey: groupTurnKeyForTurnIndex(input.userMessageId, turnIndex, target.agentId)
      }
    ];
  });
}

function buildGroupProgressStatusPayload(input: {
  input: {
    targets: Array<z.infer<typeof resolvedConversationAgentSchema>>;
  };
  label: "orchestrator.dispatched" | "orchestrator.running";
  plannedGroupRuns: Array<{
    agentId: string;
  }>;
  startedAt: number;
}): OrchestratorStatusEventPayload {
  const targetNameById = new Map(
    input.input.targets.map((target) => [target.agentId, target.agentName])
  );
  const plannedNames = input.plannedGroupRuns.map(
    (run) => targetNameById.get(run.agentId) ?? "AI 同事"
  );
  const activeAgentName = plannedNames[0] ?? "AI 同事";
  const totalAgentCount = Math.max(input.plannedGroupRuns.length, input.input.targets.length, 1);
  const queueSummary = plannedNames.slice(0, 6).join(" → ");
  const elapsedSeconds = Math.max(
    0,
    Math.round((Date.now() - input.startedAt) / 1_000)
  );
  const summary =
    input.label === "orchestrator.dispatched"
      ? `已安排 ${totalAgentCount} 个协作步骤：${queueSummary || activeAgentName}。完成后会自动写回聊天和文件。`
      : `${activeAgentName}等 AI 同事仍在处理，已等待 ${elapsedSeconds} 秒。完成后会自动写回聊天和文件。`;

  return {
    activeAgentName,
    failures: [],
    label: input.label,
    state: "running",
    successfulAgentCount: 0,
    summary,
    totalAgentCount
  };
}

function resolveInitialGroupTargets(input: {
  initialTargetAgentIds: string[];
  targets: Array<z.infer<typeof resolvedConversationAgentSchema>>;
}): Array<z.infer<typeof resolvedConversationAgentSchema>> {
  const targetById = new Map(input.targets.map((target) => [target.agentId, target]));
  const seen = new Set<string>();
  const resolvedTargets: Array<z.infer<typeof resolvedConversationAgentSchema>> = [];

  for (const agentId of input.initialTargetAgentIds) {
    const target = targetById.get(agentId);

    if (!target || seen.has(target.agentId)) {
      continue;
    }

    seen.add(target.agentId);
    resolvedTargets.push(target);
  }

  return resolvedTargets;
}

function buildFailedGroupRunDescriptors(
  input: {
    initialTargetAgentIds: string[];
    mentionedAgentIds: string[];
    userMessageId: string;
  },
  failures: OrchestratorState["failures"]
): Array<{
  agentId: string;
  provider: ProviderId;
  reason: "human_mention" | "scheduled_followup";
  turnKey: string;
}> {
  return failures.map((failure) => {
    const initialTurnIndex = input.initialTargetAgentIds.indexOf(failure.agentId);
    return {
      agentId: failure.agentId,
      provider: failure.provider,
      reason: resolveHumanTriggeredRunReason(input.mentionedAgentIds, failure.agentId),
      turnKey:
        initialTurnIndex >= 0
          ? groupTurnKeyForTurnIndex(
              input.userMessageId,
              initialTurnIndex,
              failure.agentId
            )
          : `group:${input.userMessageId}:failure:${failure.agentId}`
    };
  });
}

function groupTurnKeyForTurnIndex(
  userMessageId: string,
  turnIndex: number,
  agentId: string
): string {
  return `group:${userMessageId}:turn:${turnIndex}:${agentId}`;
}

function resolveHumanTriggeredRunReason(
  mentionedAgentIds: string[],
  agentId: string
): "human_mention" | "scheduled_followup" {
  return mentionedAgentIds.includes(agentId) ? "human_mention" : "scheduled_followup";
}

function summarizeGroupFailures(failures: OrchestratorState["failures"]): string {
  return failures
    .map((failure) => `${failure.agentName}: ${failure.detail}`)
    .join("; ")
    .slice(0, 1_000);
}

function errorMessageForCheckpoint(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function formatGroupFailureNotice(state: OrchestratorState): string {
  if (state.results.length === 0) {
    return [
      "这次协作没有 AI 同事完成回复。",
      ...state.failures.map(
        (failure) => `- ${failure.agentName}：${failure.detail}`
      )
    ].join("\n");
  }

  return [
    "部分 AI 同事暂时没有完成回复，已先展示完成同事的结果。",
    ...state.failures.map(
      (failure) => `- ${failure.agentName}：${failure.detail}`
    )
  ].join("\n");
}

function buildGroupMarkdownFallback(input: {
  finalContent: string;
  message: string;
  results: OrchestratorState["results"];
}): RuntimeArtifactDraft | null {
  if (!shouldCreateMarkdownFallback(input) || hasMarkdownArtifact(input.results)) {
    return null;
  }

  const markdown = truncateMarkdown(
    sanitizeAssistantVisibleContent(resolveFallbackMarkdownContent(input), {
      stripCollaborationPlaceholders: true
    })
  );

  if (markdown.trim().length === 0) {
    return null;
  }

  return {
    fileName: "collaboration-deliverable.md",
    markdown,
    mimeType: "text/markdown",
    title: "协作交付物",
    type: "markdown"
  };
}

function shouldCreateMarkdownFallback(input: {
  finalContent: string;
  message: string;
  results: OrchestratorState["results"];
}): boolean {
  if (mentionsMarkdownDeliverable(input.message)) {
    return true;
  }

  const claimedOutput = [
    input.finalContent,
    ...input.results.map((result) => result.finalContent)
  ].join("\n\n");

  return claimsMarkdownDeliverable(claimedOutput);
}

function mentionsMarkdownDeliverable(text: string): boolean {
  const normalized = text.toLowerCase();
  const mentionsMarkdown =
    normalized.includes("markdown") || /(^|[^\p{L}\p{N}])md($|[^\p{L}\p{N}])/iu.test(text);
  const asksForDeliverable =
    /可下载|下载|交付物|文件|文档|附件|产物/u.test(text);

  return mentionsMarkdown && asksForDeliverable;
}

function claimsMarkdownDeliverable(text: string): boolean {
  if (!mentionsMarkdownDeliverable(text)) {
    return false;
  }

  return /已(?:经)?(?:生成|创建|产出|整理|附上)|生成了|创建了|可(?:直接)?下载/u.test(text);
}

function hasMarkdownArtifact(results: OrchestratorState["results"]): boolean {
  return results.some((result) =>
    (result.artifacts ?? []).some((artifact) => artifact.type === "markdown")
  );
}

function resolveFallbackMarkdownContent(input: {
  finalContent: string;
  results: OrchestratorState["results"];
}): string {
  if (input.finalContent.trim().length > 0) {
    return input.finalContent;
  }

  return input.results
    .map((result) => `## ${result.agentName}\n\n${result.finalContent}`)
    .join("\n\n");
}

function truncateMarkdown(markdown: string): string {
  if (markdown.length <= runtimeMarkdownArtifactMaxMarkdownChars) {
    return markdown;
  }

  return markdown.slice(0, runtimeMarkdownArtifactMaxMarkdownChars - 40).trimEnd() +
    "\n\n（内容过长，已截断。）";
}

function formatDirectDispatchFailureNotice(error: unknown): string {
  return [
    "这次 AI 同事执行没有完成。",
    `原因：${errorMessageForCheckpoint(error)}`,
    "请检查模型连接或稍后重试。"
  ].join("\n");
}

function formatGroupDispatchFailureNotice(error: unknown): string {
  return [
    "这次多同事协作没有完成。",
    `原因：${errorMessageForCheckpoint(error)}`,
    "请检查模型连接后重试，或减少参与同事数量再发送。"
  ].join("\n");
}

function remapStreamEventMessageIds(
  events: StreamEvent[],
  messageId: string,
  finalContent?: string
): StreamEvent[] {
  return sanitizeAssistantVisibleStreamEvents(events).map((event) => {
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
            finalContent: finalContent ?? event.payload.finalContent,
            messageId
          }
        };
      case "conversation.status":
        return event;
    }
  });
}

function createAssistantCompletedEvent(message: Message): StreamEvent {
  return {
    kind: "conversation.message.completed",
    payload: {
      finalContent: sanitizeAssistantVisibleContent(message.content),
      messageId: message.id
    }
  };
}

function parseVisualWorkflowCreationIntent(content: string): { goal: string } | null {
  const normalized = content.toLowerCase();
  const mentionsWorkflow = /workflow|工作流/iu.test(content) || /workflow/iu.test(normalized);
  const asksToCreate =
    /创建|新建|设计|生成|建立|搭建|帮我创建|create|build|generate|new/iu.test(
      content
    );

  if (!mentionsWorkflow || !asksToCreate) {
    return null;
  }

  const goal = extractVisualWorkflowGoal(content);

  return goal ? { goal } : null;
}

function extractVisualWorkflowGoal(content: string): string | null {
  const explicitGoal = /目标\s*[：:]\s*([\s\S]+?)(?=(?:请先|先由|不要直接|不要|等待我|$))/iu.exec(
    content
  )?.[1];

  if (explicitGoal !== undefined) {
    const normalized = explicitGoal.trim().replace(/^[：:，,。；;\s]+/u, "");

    return normalized.length > 0 ? normalized : null;
  }

  const candidate = content
    .replace(/^.*?(?:创建|新建|设计|生成|建立|搭建|create|build|generate|new).*?(?:workflow|工作流)[。；;，,\s]*/iu, "")
    .replace(/请先[\s\S]*$/u, "")
    .replace(/先由[\s\S]*$/u, "")
    .replace(/不要直接[\s\S]*$/u, "")
    .replace(/等待我[\s\S]*$/u, "");
  const normalized = candidate
    .trim()
    .replace(/^[：:，,。；;\s]+/u, "")
    .replace(/[。；;，,\s]+$/u, "");

  return normalized.length > 0 ? normalized : null;
}

function summarizeProviders(
  targets: Array<z.infer<typeof resolvedConversationAgentSchema>>
): string {
  const uniqueProviders = [...new Set(targets.map((target) => target.provider))];

  if (uniqueProviders.length === 1) {
    return uniqueProviders[0] ?? "unknown";
  }

  return "mixed";
}
