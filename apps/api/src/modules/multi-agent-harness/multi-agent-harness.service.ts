import { createHash } from "node:crypto";

import { Inject, Injectable } from "@nestjs/common";

import type {
  Message,
  MultiAgentChannelEvent,
  MultiAgentContextSnapshot,
  MultiAgentHandoff,
  MultiAgentOutputIntent,
  MultiAgentParticipant,
  MultiAgentTurn,
  ProviderId
} from "@agenthub/contracts";
import {
  multiAgentChannelEventSchema,
  multiAgentContextSnapshotSchema,
  multiAgentHandoffSchema,
  multiAgentParticipantSchema,
  multiAgentTurnSchema
} from "@agenthub/contracts";
import {
  selectHandoffIntentTargets,
  type OrchestratorResult,
  type OrchestratorTarget
} from "@agenthub/domain/orchestration";

import { ChannelMembersService } from "../channels/channel-members.service.js";
import { DatabaseService, type DatabaseExecutor } from "../database/database.service.js";
import {
  MultiAgentHarnessRepository,
  type ConversationAgentProfileRow,
  type MultiAgentChannelEventRow,
  type MultiAgentContextSnapshotRow,
  type MultiAgentHandoffRow,
  type MultiAgentParticipantRow,
  type MultiAgentTurnRow
} from "./multi-agent-harness.repository.js";

type HandoffIntent = Extract<MultiAgentOutputIntent, { type: "handoff_request" }>;

export type RecordGroupExecutionInput = {
  assistantMessages: Array<{
    message: Message;
    result: OrchestratorResult;
  }>;
  channelId: string;
  initialTargetAgentIds: string[];
  mentionedAgentIds: string[];
  ownerUserId: string;
  targets: OrchestratorTarget[];
  userMessageId: string;
  workspaceId: string;
};

export type RecordDirectExecutionInput = {
  assistantMessage: Message;
  artifactCount?: number;
  channelId: string;
  mentionedAgentIds: string[];
  ownerUserId: string;
  result: OrchestratorResult;
  userMessageId: string;
  workspaceId: string;
};

export type AgentRunCheckpointDescriptor = {
  agentId: string;
  provider: ProviderId;
  reason: MultiAgentTurn["reason"];
  turnKey?: string;
};

export type RecordAgentRunsStartedInput = {
  channelId: string;
  ownerUserId: string;
  runs: AgentRunCheckpointDescriptor[];
  userMessageId: string;
  workspaceId: string;
};

export type RecordAgentRunsFailedInput = RecordAgentRunsStartedInput & {
  errorCode: string;
  errorMessage: string;
};

@Injectable()
export class MultiAgentHarnessService {
  constructor(
    @Inject(ChannelMembersService)
    private readonly channelMembersService: ChannelMembersService,
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(MultiAgentHarnessRepository)
    private readonly repository: MultiAgentHarnessRepository
  ) {}

  async mirrorMessage(message: Message, executor?: DatabaseExecutor): Promise<void> {
    await this.ensureChannelParticipants(
      {
        channelId: message.conversationId,
        ownerUserId: message.ownerUserId,
        workspaceId: message.workspaceId
      },
      executor
    );

    const event = await this.repository.upsertChannelEvent(
      {
        authorId: resolveMessageAuthorId(message),
        authorType: resolveMessageAuthorType(message),
        causalChainId: message.role === "user" ? chainIdForMessage(message.id) : null,
        channelId: message.conversationId,
        content: message.content,
        createdAt: toIsoString(message.createdAt),
        eventType: resolveMessageEventType(message),
        id: eventIdForMessage(message.id),
        mentions: buildMessageMentions(message),
        messageId: message.id,
        ownerUserId: message.ownerUserId,
        provenance: buildMessageProvenance(message),
        structuredPayload: {
          messageId: message.id,
          sourceAgentId: message.sourceAgentId
        },
        workspaceId: message.workspaceId
      },
      executor
    );

    if (message.role === "user") {
      await this.repository.upsertCausalChain(
        {
          channelId: message.conversationId,
          id: chainIdForMessage(message.id),
          lastEventId: event.id,
          rootEventId: event.id,
          workspaceId: message.workspaceId
        },
        executor
      );
    }
  }

  async recordDirectExecution(input: RecordDirectExecutionInput): Promise<void> {
    await this.database.transaction(async (tx) => {
      const participants = await this.ensureChannelParticipants(input, tx);
      const assistantEvent = await this.bindAssistantMessageToChain(
        {
          assistantMessage: input.assistantMessage,
          chainId: chainIdForMessage(input.userMessageId),
          ownerUserId: input.ownerUserId,
          parentEventId: eventIdForMessage(input.userMessageId)
        },
        tx
      );
      const targetParticipant = participants.get(input.result.agentId);

      if (!targetParticipant) {
        return;
      }

      await this.recordCompletedTurn(
        {
          agentId: input.result.agentId,
          agentParticipantId: targetParticipant.id,
          causalChainId: chainIdForMessage(input.userMessageId),
          channelId: input.channelId,
          producedEventId: assistantEvent.id,
          provider: input.result.provider,
          reason: input.mentionedAgentIds.includes(input.result.agentId)
            ? "human_mention"
            : "scheduled_followup",
          artifactCount: input.artifactCount ?? 0,
          renderedPromptPreview: input.result.finalContent,
          runtimeMetadata: input.result.runtimeMetadata ?? {},
          sourceAgentParticipantId: null,
          triggeringEventId: eventIdForMessage(input.userMessageId),
          workspaceId: input.workspaceId
        },
        tx
      );
      await this.repository.upsertCausalChain(
        {
          channelId: input.channelId,
          id: chainIdForMessage(input.userMessageId),
          lastEventId: assistantEvent.id,
          rootEventId: eventIdForMessage(input.userMessageId),
          turnCount: 1,
          workspaceId: input.workspaceId
        },
        tx
      );
    });
  }

  async recordAgentRunsStarted(
    input: RecordAgentRunsStartedInput
  ): Promise<void> {
    if (input.runs.length === 0) {
      return;
    }

    await this.database.transaction(async (tx) => {
      await this.recordAgentRunCheckpoints(
        {
          ...input,
          checkpoint: "context_prepared",
          status: "running"
        },
        tx
      );
    });
  }

  async recordAgentRunsFailed(input: RecordAgentRunsFailedInput): Promise<void> {
    if (input.runs.length === 0) {
      return;
    }

    await this.database.transaction(async (tx) => {
      await this.recordAgentRunCheckpoints(
        {
          ...input,
          checkpoint: "failed",
          status: "failed"
        },
        tx
      );
    });
  }

  async recordGroupExecution(input: RecordGroupExecutionInput): Promise<void> {
    await this.database.transaction(async (tx) => {
      const participants = await this.ensureChannelParticipants(input, tx);
      const chainId = chainIdForMessage(input.userMessageId);
      const userEventId = eventIdForMessage(input.userMessageId);
      const assistantEventIdsByMessageId = new Map<string, string>();
      const latestAssistantEventIdsByAgentId = new Map<string, string>();

      for (const entry of input.assistantMessages) {
        const event = await this.bindAssistantMessageToChain(
          {
            assistantMessage: entry.message,
            chainId,
            ownerUserId: input.ownerUserId,
            parentEventId: userEventId
          },
          tx
        );
        assistantEventIdsByMessageId.set(entry.message.id, event.id);
        latestAssistantEventIdsByAgentId.set(entry.result.agentId, event.id);
      }

      const handoffByTargetAgentId = new Map<
        string,
        {
          eventId: string;
          sourceAgentParticipantId: string;
        }
      >();
      let handoffCount = 0;
      const queuedAgentIds = new Set(input.initialTargetAgentIds);

      for (let index = 0; index < input.assistantMessages.length; index += 1) {
        const entry = input.assistantMessages[index];

        if (!entry) {
          continue;
        }

        const sourceParticipant = participants.get(entry.result.agentId);

        if (!sourceParticipant) {
          continue;
        }

        for (const intent of entry.result.harnessOutput?.intents ?? []) {
          if (!isHandoffIntent(intent)) {
            continue;
          }

          const handoffTargets = selectHandoffIntentTargets({
            completedAgentIds: input.assistantMessages
              .slice(0, index + 1)
              .map((assistantMessage) => assistantMessage.result.agentId),
            intent,
            queuedAgentIds: [...queuedAgentIds],
            sourceAgentId: entry.result.agentId,
            targets: input.targets
          });

          for (const target of handoffTargets) {
            const targetParticipant = participants.get(target.agentId);

            if (!targetParticipant) {
              continue;
            }

            const handoffId = `handoff:${entry.message.id}:${handoffCount}`;
            const handoffEventId = `event:${handoffId}`;
            const targetCompletedEventId =
              latestAssistantEventIdsByAgentId.get(target.agentId) ?? null;
            const handoffStatus = targetCompletedEventId ? "completed" : "requested";

            await this.repository.upsertChannelEvent(
              {
                authorId: entry.result.agentId,
                authorType: "agent",
                causalChainId: chainId,
                channelId: input.channelId,
                content: intent.goal,
                createdAt: toIsoString(entry.message.createdAt),
                eventType: "handoff_requested",
                id: handoffEventId,
                ownerUserId: input.ownerUserId,
                parentEventId: assistantEventIdsByMessageId.get(entry.message.id) ?? userEventId,
                provenance: {
                  confidence: 1,
                  sourceId: entry.message.id,
                  sourceType: "agent_model_output",
                  trustScore: null,
                  verificationRefs: [],
                  verified: false
                },
                structuredPayload: {
                  acceptanceCriteria: intent.acceptanceCriteria,
                  constraints: intent.constraints,
                  expectedArtifact: intent.expectedArtifact ?? null,
                  goal: intent.goal,
                  sourceAgentId: entry.result.agentId,
                  targetAgentId: target.agentId,
                  targetRoleKey: intent.targetRoleKey ?? null
                },
                workspaceId: input.workspaceId
              },
              tx
            );
            await this.repository.upsertHandoff(
              {
                causalChainId: chainId,
                channelId: input.channelId,
                completedEventId: targetCompletedEventId,
                createdEventId: handoffEventId,
                id: handoffId,
                payload: {
                  acceptanceCriteria: intent.acceptanceCriteria,
                  constraints: intent.constraints,
                  contextEventIds: intent.contextEventIds ?? [],
                  expectedArtifact: intent.expectedArtifact,
                  goal: intent.goal
                },
                sourceAgentParticipantId: sourceParticipant.id,
                status: handoffStatus,
                targetAgentParticipantId: targetParticipant.id,
                targetRoleKey: intent.targetRoleKey ?? null,
                workspaceId: input.workspaceId
              },
              tx
            );
            handoffByTargetAgentId.set(target.agentId, {
              eventId: handoffEventId,
              sourceAgentParticipantId: sourceParticipant.id
            });
            queuedAgentIds.add(target.agentId);
            handoffCount += 1;
          }
        }
      }

      let agentToAgentTurnCount = 0;
      for (const entry of input.assistantMessages) {
        const participant = participants.get(entry.result.agentId);
        const producedEventId = assistantEventIdsByMessageId.get(entry.message.id);

        if (!participant || !producedEventId) {
          continue;
        }

        const handoff = handoffByTargetAgentId.get(entry.result.agentId);
        const reason: MultiAgentTurn["reason"] = handoff
          ? "agent_handoff"
          : input.mentionedAgentIds.includes(entry.result.agentId)
            ? "human_mention"
            : "scheduled_followup";

        if (reason === "agent_handoff") {
          agentToAgentTurnCount += 1;
        }

        await this.recordCompletedTurn(
          {
            agentId: entry.result.agentId,
            agentParticipantId: participant.id,
            causalChainId: chainId,
            channelId: input.channelId,
            producedEventId,
            provider: entry.result.provider,
            reason,
            artifactCount: entry.result.artifacts?.length ?? 0,
            renderedPromptPreview: entry.result.finalContent,
            runtimeMetadata: entry.result.runtimeMetadata ?? {},
            sourceAgentParticipantId: handoff?.sourceAgentParticipantId ?? null,
            triggeringEventId: handoff?.eventId ?? userEventId,
            turnKey: turnKeyForGroupResult(
              input.userMessageId,
              entry.result,
              entry.message.id
            ),
            workspaceId: input.workspaceId
          },
          tx
        );
      }

      await this.repository.upsertCausalChain(
        {
          agentToAgentTurnCount,
          channelId: input.channelId,
          id: chainId,
          lastEventId: input.assistantMessages.at(-1)
            ? assistantEventIdsByMessageId.get(input.assistantMessages.at(-1)!.message.id) ??
              userEventId
            : userEventId,
          rootEventId: userEventId,
          turnCount: input.assistantMessages.length,
          workspaceId: input.workspaceId
        },
        tx
      );
    });
  }

  async listEvents(input: {
    actorUserId: string;
    channelId: string;
    workspaceId: string;
  }): Promise<MultiAgentChannelEvent[]> {
    const access = await this.channelMembersService.assertCanRead(input);
    const rows = await this.repository.listEvents({
      channelId: input.channelId,
      ownerUserId: access.ownerUserId,
      workspaceId: input.workspaceId
    });

    return rows.map(mapChannelEventRow);
  }

  async listParticipants(input: {
    actorUserId: string;
    channelId: string;
    workspaceId: string;
  }): Promise<MultiAgentParticipant[]> {
    const access = await this.channelMembersService.assertCanRead(input);
    await this.ensureChannelParticipants({
      channelId: input.channelId,
      ownerUserId: access.ownerUserId,
      workspaceId: input.workspaceId
    });
    const rows = await this.repository.listParticipants({
      channelId: input.channelId,
      ownerUserId: access.ownerUserId,
      workspaceId: input.workspaceId
    });

    return rows.map(mapParticipantRow);
  }

  async listTurns(input: {
    actorUserId: string;
    channelId: string;
    workspaceId: string;
  }): Promise<MultiAgentTurn[]> {
    const access = await this.channelMembersService.assertCanRead(input);
    const rows = await this.repository.listTurns({
      channelId: input.channelId,
      ownerUserId: access.ownerUserId,
      workspaceId: input.workspaceId
    });

    return rows.map(mapTurnRow);
  }

  async listHandoffs(input: {
    actorUserId: string;
    channelId: string;
    workspaceId: string;
  }): Promise<MultiAgentHandoff[]> {
    const access = await this.channelMembersService.assertCanRead(input);
    const rows = await this.repository.listHandoffs({
      channelId: input.channelId,
      ownerUserId: access.ownerUserId,
      workspaceId: input.workspaceId
    });

    return rows.map(mapHandoffRow);
  }

  async listContextSnapshots(input: {
    actorUserId: string;
    channelId: string;
    workspaceId: string;
  }): Promise<MultiAgentContextSnapshot[]> {
    const access = await this.channelMembersService.assertCanRead(input);
    const rows = await this.repository.listContextSnapshots({
      channelId: input.channelId,
      ownerUserId: access.ownerUserId,
      workspaceId: input.workspaceId
    });

    return rows.map(mapContextSnapshotRow);
  }

  private async ensureChannelParticipants(
    input: {
      channelId: string;
      ownerUserId: string;
      workspaceId: string;
    },
    executor?: DatabaseExecutor
  ): Promise<Map<string, MultiAgentParticipant>> {
    const profiles = await this.repository.listConversationAgentProfiles(input, executor);
    const participants = new Map<string, MultiAgentParticipant>();

    for (const profile of profiles) {
      const roleTags = extractRoleTags(profile);
      const roleKey = resolveRoleKey(profile, roleTags);
      const participant = await this.repository.upsertParticipant(
        {
          agentId: profile.agent_id,
          channelId: input.channelId,
          displayName: profile.agent_name,
          id: participantIdForAgent(input.channelId, profile.agent_id),
          roleKey,
          roleLabel: profile.agent_name,
          roleTags,
          workspaceId: input.workspaceId
        },
        executor
      );

      participants.set(profile.agent_id, mapParticipantRow(participant));
    }

    return participants;
  }

  private async bindAssistantMessageToChain(
    input: {
      assistantMessage: Message;
      chainId: string;
      ownerUserId: string;
      parentEventId: string;
    },
    executor: DatabaseExecutor
  ): Promise<MultiAgentChannelEvent> {
    const row = await this.repository.upsertChannelEvent(
      {
        authorId: resolveMessageAuthorId(input.assistantMessage),
        authorType: resolveMessageAuthorType(input.assistantMessage),
        causalChainId: input.chainId,
        channelId: input.assistantMessage.conversationId,
        content: input.assistantMessage.content,
        createdAt: toIsoString(input.assistantMessage.createdAt),
        eventType: resolveMessageEventType(input.assistantMessage),
        id: eventIdForMessage(input.assistantMessage.id),
        messageId: input.assistantMessage.id,
        ownerUserId: input.ownerUserId,
        parentEventId: input.parentEventId,
        provenance: buildMessageProvenance(input.assistantMessage),
        structuredPayload: {
          messageId: input.assistantMessage.id,
          sourceAgentId: input.assistantMessage.sourceAgentId
        },
        workspaceId: input.assistantMessage.workspaceId
      },
      executor
    );

    return mapChannelEventRow(row);
  }

  private async recordAgentRunCheckpoints(
    input: RecordAgentRunsStartedInput & {
      checkpoint: "context_prepared" | "failed";
      errorCode?: string;
      errorMessage?: string;
      status: "failed" | "running";
    },
    executor: DatabaseExecutor
  ): Promise<void> {
    const participants = await this.ensureChannelParticipants(input, executor);
    const causalChainId = chainIdForMessage(input.userMessageId);
    const triggeringEventId = eventIdForMessage(input.userMessageId);
    const checkpointedAt = new Date().toISOString();

    for (const run of input.runs) {
      const participant = participants.get(run.agentId);

      if (!participant) {
        continue;
      }

      const turnKey = run.turnKey ?? triggeringEventId;
      const turnId = turnIdForAgentEvent(input.channelId, run.agentId, turnKey);
      const metadata = {
        checkpointSource: "message_dispatch",
        reason: run.reason,
        triggeringEventId,
        ...(input.errorCode ? { errorCode: input.errorCode } : {}),
        ...(input.errorMessage ? { errorMessage: input.errorMessage } : {})
      };

      await this.repository.upsertTurn(
        {
          agentId: run.agentId,
          agentParticipantId: participant.id,
          causalChainId,
          channelId: input.channelId,
          completedAt: input.status === "failed" ? checkpointedAt : null,
          contextSnapshotId: null,
          errorCode: input.errorCode ?? null,
          errorMessage: input.errorMessage ?? null,
          id: turnId,
          idempotencyKey: idempotencyKeyForTurn({
            agentParticipantId: participant.id,
            causalChainId,
            channelId: input.channelId,
            reason: run.reason,
            triggeringEventId,
            turnKey
          }),
          producedEventIds: [],
          priority: priorityForTurnReason(run.reason),
          reason: run.reason,
          sourceAgentParticipantId: null,
          startedAt: checkpointedAt,
          status: input.status,
          triggeringEventId,
          workspaceId: input.workspaceId
        },
        executor
      );
      await this.repository.upsertAgentRunLedger(
        {
          agentId: run.agentId,
          artifactCount: 0,
          channelId: input.channelId,
          checkpoint: input.checkpoint,
          contextSnapshotId: null,
          id: `agent-run:${turnId}`,
          metadata,
          producedEventIds: [],
          provider: run.provider,
          status: input.status,
          turnId,
          workspaceId: input.workspaceId
        },
        executor
      );
    }
  }

  private async recordCompletedTurn(
    input: {
      agentId: string;
      agentParticipantId: string;
      causalChainId: string;
      channelId: string;
      producedEventId: string;
      provider: string;
      reason: MultiAgentTurn["reason"];
      artifactCount?: number;
      renderedPromptPreview: string;
      runtimeMetadata?: Record<string, unknown>;
      sourceAgentParticipantId: string | null;
      triggeringEventId: string;
      turnKey?: string;
      workspaceId: string;
    },
    executor: DatabaseExecutor
  ): Promise<void> {
    const turnKey = input.turnKey ?? input.triggeringEventId;
    const turnId = turnIdForAgentEvent(input.channelId, input.agentId, turnKey);
    const snapshotId = `context:${turnId}`;
    const renderedPromptPreview = input.renderedPromptPreview.slice(0, 4_000);
    const tokenEstimate = {
      bySourceType: {
        recent_channel_history: estimateTokens(renderedPromptPreview),
        triggering_event: 1
      },
      total: estimateTokens(renderedPromptPreview)
    };

    await this.repository.upsertContextSnapshot(
      {
        agentParticipantId: input.agentParticipantId,
        agentTurnId: turnId,
        causalChainId: input.causalChainId,
        channelId: input.channelId,
        id: snapshotId,
        renderedPromptHash: hashText(renderedPromptPreview),
        renderedPromptPreview,
        sourceRefs: [
          {
            included: true,
            reason: "turn_trigger",
            refId: input.triggeringEventId,
            tokenEstimate: 1,
            type: "triggering_event"
          },
          {
            included: true,
            reason: "agent_visible_output",
            refId: input.producedEventId,
            tokenEstimate: estimateTokens(renderedPromptPreview),
            type: "recent_channel_history"
          }
        ],
        tokenEstimate,
        workspaceId: input.workspaceId
      },
      executor
    );
    await this.repository.upsertTurn(
      {
        agentId: input.agentId,
        agentParticipantId: input.agentParticipantId,
        causalChainId: input.causalChainId,
        channelId: input.channelId,
        completedAt: new Date().toISOString(),
        contextSnapshotId: snapshotId,
        id: turnId,
        idempotencyKey: idempotencyKeyForTurn({
          agentParticipantId: input.agentParticipantId,
          causalChainId: input.causalChainId,
          channelId: input.channelId,
          reason: input.reason,
          triggeringEventId: input.triggeringEventId,
          turnKey
        }),
        producedEventIds: [input.producedEventId],
        priority: priorityForTurnReason(input.reason),
        reason: input.reason,
        sourceAgentParticipantId: input.sourceAgentParticipantId,
        startedAt: new Date().toISOString(),
        status: "completed",
        triggeringEventId: input.triggeringEventId,
        workspaceId: input.workspaceId
      },
      executor
    );
    await this.repository.upsertAgentRunLedger(
      {
        agentId: input.agentId,
        artifactCount: input.artifactCount ?? 0,
        channelId: input.channelId,
        checkpoint: "completed",
        contextSnapshotId: snapshotId,
        id: `agent-run:${turnId}`,
        metadata: input.runtimeMetadata ?? {},
        producedEventIds: [input.producedEventId],
        provider: input.provider,
        status: "completed",
        turnId,
        workspaceId: input.workspaceId
      },
      executor
    );
  }
}

function mapChannelEventRow(row: MultiAgentChannelEventRow): MultiAgentChannelEvent {
  return multiAgentChannelEventSchema.parse({
    authorId: row.author_id,
    authorType: row.author_type,
    causalChainId: row.causal_chain_id,
    channelId: row.channel_id,
    content: row.content,
    createdAt: toIsoString(row.created_at),
    id: row.id,
    mentions: row.mentions ?? [],
    parentEventId: row.parent_event_id,
    provenance: row.provenance,
    structuredPayload: row.structured_payload ?? {},
    type: row.event_type,
    visibility: row.visibility,
    workspaceId: row.workspace_id
  });
}

function mapParticipantRow(row: MultiAgentParticipantRow): MultiAgentParticipant {
  return multiAgentParticipantSchema.parse({
    agentId: row.agent_id,
    channelId: row.channel_id,
    createdAt: toIsoString(row.created_at),
    displayName: row.display_name,
    id: row.id,
    memoryPolicy: row.memory_policy ?? {},
    readCursor: row.read_cursor ?? {},
    roleContract: row.role_contract ?? {},
    roleKey: row.role_key,
    roleLabel: row.role_label,
    roleTags: row.role_tags ?? [],
    status: row.status,
    toolPolicyId: row.tool_policy_id,
    updatedAt: toIsoString(row.updated_at),
    workspaceId: row.workspace_id
  });
}

function mapTurnRow(row: MultiAgentTurnRow): MultiAgentTurn {
  return multiAgentTurnSchema.parse({
    agentId: row.agent_id,
    agentParticipantId: row.agent_participant_id,
    budget: row.budget ?? {},
    causalChainId: row.causal_chain_id,
    channelId: row.channel_id,
    completedAt: row.completed_at ? toIsoString(row.completed_at) : null,
    contextSnapshotId: row.context_snapshot_id,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    id: row.id,
    idempotencyKey: row.idempotency_key,
    priority: row.priority,
    producedEventIds: row.produced_event_ids ?? [],
    queuedAt: toIsoString(row.queued_at),
    reason: row.reason,
    runtimePolicyId: row.runtime_policy_id,
    sourceAgentParticipantId: row.source_agent_participant_id,
    startedAt: row.started_at ? toIsoString(row.started_at) : null,
    status: row.status,
    triggeringEventId: row.triggering_event_id,
    workspaceId: row.workspace_id
  });
}

function mapHandoffRow(row: MultiAgentHandoffRow): MultiAgentHandoff {
  return multiAgentHandoffSchema.parse({
    acceptedEventId: row.accepted_event_id,
    causalChainId: row.causal_chain_id,
    channelId: row.channel_id,
    completedEventId: row.completed_event_id,
    createdAt: toIsoString(row.created_at),
    createdEventId: row.created_event_id,
    id: row.id,
    payload: row.payload,
    sourceAgentParticipantId: row.source_agent_participant_id,
    status: row.status,
    targetAgentParticipantId: row.target_agent_participant_id,
    targetRoleKey: row.target_role_key,
    updatedAt: toIsoString(row.updated_at),
    workspaceId: row.workspace_id
  });
}

function mapContextSnapshotRow(
  row: MultiAgentContextSnapshotRow
): MultiAgentContextSnapshot {
  return multiAgentContextSnapshotSchema.parse({
    agentParticipantId: row.agent_participant_id,
    agentTurnId: row.agent_turn_id,
    causalChainId: row.causal_chain_id,
    channelId: row.channel_id,
    createdAt: toIsoString(row.created_at),
    id: row.id,
    redactions: row.redactions ?? [],
    renderedPromptHash: row.rendered_prompt_hash,
    renderedPromptPreview: row.rendered_prompt_preview,
    sourceRefs: row.source_refs ?? [],
    tokenEstimate: row.token_estimate ?? {
      bySourceType: {},
      total: 0
    },
    workspaceId: row.workspace_id
  });
}

function buildMessageMentions(message: Message): MultiAgentChannelEvent["mentions"] {
  return message.mentionedAgentIds.map((agentId) => ({
    confidence: 1,
    kind: "agent",
    raw: `@${agentId}`,
    requiresHumanConfirmation: false,
    targetParticipantIds: [participantIdForAgent(message.conversationId, agentId)]
  }));
}

function buildMessageProvenance(
  message: Message
): MultiAgentChannelEvent["provenance"] {
  if (message.role === "assistant" && message.sourceAgentId) {
    return {
      confidence: 1,
      sourceId: message.id,
      sourceType: "agent_model_output",
      trustScore: null,
      verificationRefs: [],
      verified: false
    };
  }

  if (message.role === "user") {
    return {
      confidence: 1,
      sourceId: message.authorUserId,
      sourceType: "human_input",
      trustScore: 1,
      verificationRefs: [],
      verified: true
    };
  }

  return {
    confidence: 1,
    sourceId: message.id,
    sourceType: "system_policy",
    trustScore: 1,
    verificationRefs: [],
    verified: true
  };
}

function resolveMessageAuthorId(message: Message): string {
  if (message.role === "assistant") {
    return message.sourceAgentId ?? "system";
  }

  if (message.role === "user") {
    return message.authorUserId ?? message.ownerUserId;
  }

  return "system";
}

function resolveMessageAuthorType(message: Message): MultiAgentChannelEvent["authorType"] {
  if (message.role === "assistant" && message.sourceAgentId) {
    return "agent";
  }

  if (message.role === "user") {
    return "human";
  }

  return "system";
}

function resolveMessageEventType(message: Message): MultiAgentChannelEvent["type"] {
  if (message.role === "assistant" && message.sourceAgentId) {
    return "agent_message";
  }

  if (message.role === "user") {
    return "user_message";
  }

  return "system_event";
}

function isHandoffIntent(intent: MultiAgentOutputIntent): intent is HandoffIntent {
  return intent.type === "handoff_request";
}

function extractRoleTags(profile: ConversationAgentProfileRow): string[] {
  return (profile.capability_tags ?? []).filter((tag) =>
    /^role\s*[:=：]/i.test(tag) || /^channel\s*[:=：]/i.test(tag)
  );
}

function resolveRoleKey(
  profile: ConversationAgentProfileRow,
  roleTags: string[]
): string {
  const explicitRole = roleTags.find((tag) => /^role\s*[:=：]/i.test(tag));

  if (explicitRole) {
    return normalizeRoleKey(explicitRole.replace(/^role\s*[:=：]\s*/i, ""));
  }

  return normalizeRoleKey(profile.agent_name || profile.agent_id);
}

function normalizeRoleKey(value: string): string {
  return value.trim().replace(/^@/, "").replace(/[\s_]+/g, "-").toLowerCase();
}

function turnKeyForGroupResult(
  userMessageId: string,
  result: OrchestratorResult,
  fallbackKey: string
): string {
  if (typeof result.turnIndex === "number") {
    return groupTurnKeyForTurnIndex(userMessageId, result.turnIndex, result.agentId);
  }

  return fallbackKey;
}

function groupTurnKeyForTurnIndex(
  userMessageId: string,
  turnIndex: number,
  agentId: string
): string {
  return `group:${userMessageId}:turn:${turnIndex}:${agentId}`;
}

function participantIdForAgent(channelId: string, agentId: string): string {
  return `participant:${channelId}:${agentId}`;
}

function eventIdForMessage(messageId: string): string {
  return `event:message:${messageId}`;
}

function chainIdForMessage(messageId: string): string {
  return `chain:${eventIdForMessage(messageId)}`;
}

function turnIdForAgentEvent(channelId: string, agentId: string, eventId: string): string {
  return `turn:${channelId}:${agentId}:${hashText(eventId).slice(0, 16)}`;
}

function idempotencyKeyForTurn(input: {
  agentParticipantId: string;
  causalChainId: string;
  channelId: string;
  reason: MultiAgentTurn["reason"];
  triggeringEventId: string;
  turnKey: string;
}): string {
  return hashText(
    [
      input.channelId,
      input.triggeringEventId,
      input.turnKey,
      input.agentParticipantId,
      input.reason,
      input.causalChainId
    ].join(":")
  );
}

function hashText(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function priorityForTurnReason(reason: MultiAgentTurn["reason"]): number {
  switch (reason) {
    case "human_mention":
      return 100;
    case "reply_to_agent":
      return 95;
    case "agent_handoff":
      return 80;
    case "human_role_mention":
      return 75;
    case "human_all_agents":
      return 70;
    case "agent_mention_allowed":
      return 50;
    case "manual_retry":
      return 45;
    case "scheduled_followup":
      return 30;
  }
}

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
