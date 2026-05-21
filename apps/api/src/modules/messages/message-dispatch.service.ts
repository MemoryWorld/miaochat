import { randomUUID } from "node:crypto";

import {
  BadRequestException,
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
import { Client, Connection } from "@temporalio/client";
import { z } from "zod";

import { DatabaseService } from "../database/database.service.js";
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
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(MessagesService) private readonly messagesService: MessagesService,
    @Inject(PinMessageService) private readonly pinMessageService: PinMessageService,
    @Inject(StreamBrokerService) private readonly streamBroker: StreamBrokerService
  ) {}

  async onModuleDestroy(): Promise<void> {
    await this.connection?.close();
  }

  async send(input: unknown) {
    const parsed = createMessageInputSchema.parse(input);

    if (parsed.role !== "user") {
      throw new BadRequestException("Only user-authored messages can be dispatched.");
    }

    const resolvedConversation = await this.resolveConversation(
      parsed.conversationId,
      parsed.workspaceId
    );

    if (
      resolvedConversation.mode === "direct" &&
      resolvedConversation.agents[0]?.provider !== "mock"
    ) {
      throw new BadRequestException(
        "The single-agent mock slice requires a direct conversation backed by a mock agent."
      );
    }

    const userMessage = await this.messagesService.create(parsed);

    if (resolvedConversation.mode === "direct") {
      const directAgent = resolvedConversation.agents[0];

      if (!directAgent) {
        throw new NotFoundException(
          `No agent binding found for conversation ${parsed.conversationId} in workspace ${parsed.workspaceId}`
        );
      }

      void this.dispatchDirectAssistantReply({
        agentId: directAgent.agentId,
        conversationId: parsed.conversationId,
        message: parsed.content,
        workspaceId: parsed.workspaceId
      });
    } else {
      void this.dispatchGroupAssistantReply({
        conversationId: parsed.conversationId,
        message: parsed.content,
        targets: resolveTargetAgents(
          resolvedConversation.agents,
          userMessage.mentionedAgentIds
        ),
        workspaceId: parsed.workspaceId
      });
    }

    return userMessage;
  }

  private async dispatchDirectAssistantReply(input: {
    agentId: string;
    conversationId: string;
    message: string;
    workspaceId: string;
  }): Promise<void> {
    const context = await this.pinMessageService.loadConversationContext(
      input.conversationId,
      input.workspaceId
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
      sourceAgentId: input.agentId,
      workspaceId: input.workspaceId
    });
  }

  private async dispatchGroupAssistantReply(input: {
    conversationId: string;
    message: string;
    targets: Array<z.infer<typeof resolvedConversationAgentSchema>>;
    workspaceId: string;
  }): Promise<void> {
    const context = await this.pinMessageService.loadConversationContext(
      input.conversationId,
      input.workspaceId
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
      sourceAgentId: null,
      workspaceId: input.workspaceId
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

  private async resolveConversation(
    conversationId: string,
    workspaceId: string
  ): Promise<z.infer<typeof resolvedConversationSchema>> {
    const result = await this.database.query<{
      agent_id: string;
      agent_name: string;
      mode: "direct" | "group";
      provider: ProviderId;
    }>(
      `
        SELECT
          conversation_agents.agent_id,
          conversation_agents.agent_name,
          conversations.mode,
          custom_agents.provider
        FROM conversations
        INNER JOIN conversation_agents
          ON conversation_agents.conversation_id = conversations.id
          AND conversation_agents.workspace_id = conversations.workspace_id
        INNER JOIN custom_agents
          ON custom_agents.id = conversation_agents.agent_id
          AND custom_agents.workspace_id = conversation_agents.workspace_id
        WHERE conversations.id = $1 AND conversations.workspace_id = $2
        ORDER BY conversation_agents.agent_id ASC
      `,
      [conversationId, workspaceId]
    );

    if (result.rows.length === 0) {
      throw new NotFoundException(
        `No agent binding found for conversation ${conversationId} in workspace ${workspaceId}`
      );
    }

    return resolvedConversationSchema.parse({
      agents: result.rows.map((row) => ({
        agentId: row.agent_id,
        agentName: row.agent_name,
        provider: row.provider
      })),
      mode: result.rows[0]?.mode
    });
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
