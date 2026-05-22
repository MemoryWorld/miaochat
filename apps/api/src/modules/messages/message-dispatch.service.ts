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
  type ProviderId,
  type StreamEvent
} from "@agenthub/contracts";
import { mapToPublicError } from "@agenthub/domain";
import { Client, Connection } from "@temporalio/client";
import { z } from "zod";

import { ConversationsRepository } from "../conversations/conversations.repository.js";
import { RateLimitService } from "../limits/rate-limit.service.js";
import { MetricsRegistry } from "../../observability/metrics-registry.service.js";
import { StructuredLogger } from "../../observability/structured-logger.service.js";
import { TraceRecorder } from "../../observability/trace-recorder.service.js";
import { StreamBrokerService } from "../streams/stream-broker.service.js";
import { MessagesService } from "./messages.service.js";
import { PinMessageService } from "./pin-message.service.js";

const resolvedConversationAgentSchema = z.object({
  agentId: z.string().min(1),
  agentName: z.string().min(1),
  provider: z.custom<ProviderId>((value) => typeof value === "string" && value.length > 0)
});

const resolvedConversationSchema = z.object({
  agents: z.array(resolvedConversationAgentSchema).min(1),
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

    const resolvedConversation = await this.resolveConversation(
      parsed.conversationId,
      parsed.workspaceId,
      ownerUserId
    );

    if (
      resolvedConversation.mode === "direct" &&
      resolvedConversation.agents[0]?.provider !== "mock"
    ) {
      throw new BadRequestException(
        "The single-agent mock slice requires a direct conversation backed by a mock agent."
      );
    }

    const userMessage = await this.messagesService.create(parsed, ownerUserId);

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
          conversationId: parsed.conversationId,
          message: parsed.content,
          ownerUserId,
          workspaceId: parsed.workspaceId
        })
      );
    } else {
      this.runDetachedDispatch(
        this.dispatchGroupAssistantReply({
          conversationId: parsed.conversationId,
          message: parsed.content,
          ownerUserId,
          targets: resolveTargetAgents(
            resolvedConversation.agents,
            userMessage.mentionedAgentIds
          ),
          workspaceId: parsed.workspaceId
        })
      );
    }

    return userMessage;
  }

  private async dispatchDirectAssistantReply(input: {
    agentId: string;
    conversationId: string;
    message: string;
    ownerUserId: string;
    workspaceId: string;
  }): Promise<void> {
    const span = this.traceRecorder.startSpan("provider.dispatch.direct", {
      agentId: input.agentId,
      conversationId: input.conversationId,
      provider: "mock",
      workspaceId: input.workspaceId
    });
    this.metrics.incrementCounter("provider_dispatch_total", {
      mode: "direct",
      provider: "mock"
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
      const assistantMessageId = randomUUID();
      const streamEvents = remapStreamEventMessageIds(execution.streamEvents, assistantMessageId);

      for (const event of streamEvents) {
        this.streamBroker.publish({
          conversationId: input.conversationId,
          event,
          workspaceId: input.workspaceId
        });
      }

      await this.messagesService.createAssistantMessage({
        content: execution.finalContent,
        conversationId: input.conversationId,
        id: assistantMessageId,
        ownerUserId: input.ownerUserId,
        sourceAgentId: input.agentId,
        workspaceId: input.workspaceId
      });

      this.metrics.incrementCounter("provider_dispatch_success_total", {
        mode: "direct",
        provider: "mock"
      });
      span.end({ assistantMessageId });
    } catch (error) {
      this.metrics.incrementCounter("provider_dispatch_error_total", {
        mode: "direct",
        provider: "mock"
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
    message: string;
    ownerUserId: string;
    targets: Array<z.infer<typeof resolvedConversationAgentSchema>>;
    workspaceId: string;
  }): Promise<void> {
    const span = this.traceRecorder.startSpan("provider.dispatch.group", {
      conversationId: input.conversationId,
      targetAgentCount: input.targets.length,
      workspaceId: input.workspaceId
    });
    this.metrics.incrementCounter("provider_dispatch_total", {
      mode: "group",
      provider: "mock"
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
            message: input.message,
            targets: input.targets,
            workspaceId: input.workspaceId
          }
        ],
        taskQueue: process.env.WORKER_TASK_QUEUE ?? "agenthub-default",
        workflowId: `group-orchestrator:${input.conversationId}:${randomUUID()}`
      })) as {
        finalContent: string;
        streamEvents: StreamEvent[];
      };
      const assistantMessageId = randomUUID();
      const streamEvents = remapStreamEventMessageIds(execution.streamEvents, assistantMessageId);

      for (const event of streamEvents) {
        if (event.kind === "conversation.status") {
          this.metrics.incrementCounter("orchestrator_state_total", {
            label: event.payload.label,
            state: event.payload.state
          });
        }

        this.streamBroker.publish({
          conversationId: input.conversationId,
          event,
          workspaceId: input.workspaceId
        });
      }

      await this.messagesService.createAssistantMessage({
        content: execution.finalContent,
        conversationId: input.conversationId,
        id: assistantMessageId,
        ownerUserId: input.ownerUserId,
        sourceAgentId: null,
        workspaceId: input.workspaceId
      });

      this.metrics.incrementCounter("provider_dispatch_success_total", {
        mode: "group",
        provider: "mock"
      });
      span.end({ assistantMessageId });
    } catch (error) {
      this.metrics.incrementCounter("provider_dispatch_error_total", {
        mode: "group",
        provider: "mock"
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
      throw new NotFoundException(
        `No agent binding found for conversation ${conversationId} in workspace ${workspaceId}`
      );
    }

    return resolvedConversationSchema.parse({
      agents: result.map((row) => ({
        agentId: row.agent_id,
        agentName: row.agent_name,
        provider: row.provider
      })),
      mode: result[0]?.mode
    });
  }

  private runDetachedDispatch(dispatchPromise: Promise<void>): void {
    // The dispatch routine already records metrics and logs failures internally.
    void dispatchPromise.catch(() => {});
  }
}

function resolveTargetAgents(
  agents: Array<z.infer<typeof resolvedConversationAgentSchema>>,
  mentionedAgentIds: string[]
): Array<z.infer<typeof resolvedConversationAgentSchema>> {
  if (mentionedAgentIds.length === 0) {
    return agents;
  }

  const agentMap = new Map(agents.map((agent) => [agent.agentId, agent]));

  return mentionedAgentIds.flatMap((agentId) => {
    const agent = agentMap.get(agentId);
    return agent ? [agent] : [];
  });
}

function remapStreamEventMessageIds(
  events: StreamEvent[],
  messageId: string
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
            finalContent: event.payload.finalContent,
            messageId
          }
        };
      case "conversation.status":
        return event;
    }
  });
}
