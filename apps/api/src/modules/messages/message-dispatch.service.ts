import { randomUUID } from "node:crypto";

import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
  type OnModuleDestroy
} from "@nestjs/common";

import {
  createMessageInputSchema,
  sanitizeAssistantVisibleContent,
  sanitizeAssistantVisibleStreamEvents,
  type Message,
  type ProviderId,
  type StreamEvent
} from "@agenthub/contracts";
import { mapToPublicError } from "@agenthub/domain";
import {
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
import { MessagesService } from "./messages.service.js";
import { PinMessageService } from "./pin-message.service.js";

const resolvedConversationAgentSchema = z.object({
  agentId: z.string().min(1),
  agentName: z.string().min(1),
  capabilityTags: z.array(z.string().min(1)).default([]),
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
    @Inject(TraceRecorder) private readonly traceRecorder: TraceRecorder
  ) {}

  async onModuleDestroy(): Promise<void> {
    await this.connection?.close();
  }

  async send(input: unknown, ownerUserId: string) {
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
    const resolvedConversation = await this.resolveConversation(
      parsed.conversationId,
      parsed.workspaceId,
      sendAccess.ownerUserId
    );

    const userMessage = await this.messagesService.create(parsed, ownerUserId, sendAccess);

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

    try {
      const context = await this.pinMessageService.loadConversationContext(
        input.conversationId,
        input.workspaceId,
        input.ownerUserId
      );
      const client = await this.getTemporalClient();
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
        finalContent: string;
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
      await this.multiAgentHarnessService.recordDirectExecution({
        assistantMessage,
        channelId: input.conversationId,
        mentionedAgentIds: input.mentionedAgentIds,
        ownerUserId: input.ownerUserId,
        result: {
          agentId: input.agentId,
          agentName: input.agentName,
          finalContent: visibleFinalContent,
          outputStyle: input.outputStyle,
          provider: input.provider,
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

    try {
      const context = await this.pinMessageService.loadConversationContext(
        input.conversationId,
        input.workspaceId,
        input.ownerUserId
      );
      const client = await this.getTemporalClient();
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
      for (const result of execution.state.results) {
        const visibleResult = {
          ...result,
          finalContent: sanitizeAssistantVisibleContent(result.finalContent, {
            stripCollaborationPlaceholders: true
          })
        };
        const assistantMessage = await this.messagesService.createAssistantMessage({
          content: visibleResult.finalContent,
          conversationId: input.conversationId,
          id: randomUUID(),
          ownerUserId: input.ownerUserId,
          sourceAgentId: result.agentId,
          workspaceId: input.workspaceId
        });
        assistantMessages.push({
          message: assistantMessage,
          result: visibleResult
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

function summarizeProviders(
  targets: Array<z.infer<typeof resolvedConversationAgentSchema>>
): string {
  const uniqueProviders = [...new Set(targets.map((target) => target.provider))];

  if (uniqueProviders.length === 1) {
    return uniqueProviders[0] ?? "unknown";
  }

  return "mixed";
}
