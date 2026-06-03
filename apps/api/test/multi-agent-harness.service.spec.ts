import { describe, expect, it, vi } from "vitest";

import type { Message } from "@agenthub/contracts";
import type { OrchestratorResult } from "@agenthub/domain/orchestration";

import { MultiAgentHarnessService } from "../src/modules/multi-agent-harness/multi-agent-harness.service.js";

describe("MultiAgentHarnessService", () => {
  it("records repeated group turns per assistant message without overwriting earlier turns", async () => {
    const tx = {};
    const database = {
      transaction: vi.fn(async (callback: (executor: unknown) => Promise<void>) =>
        callback(tx)
      )
    };
    const repository = {
      listConversationAgentProfiles: vi.fn(async () => [
        {
          agent_id: "agent_planner",
          agent_name: "Planner",
          capability_tags: ["role:planning"]
        },
        {
          agent_id: "agent_executor",
          agent_name: "Executor",
          capability_tags: ["role:software-engineer"]
        }
      ]),
      upsertCausalChain: vi.fn(async () => undefined),
      upsertChannelEvent: vi.fn(async (input: ChannelEventInput) =>
        channelEventRow(input)
      ),
      upsertContextSnapshot: vi.fn(async (input: ContextSnapshotInput) =>
        contextSnapshotRow(input)
      ),
      upsertHandoff: vi.fn(async () => undefined),
      upsertParticipant: vi.fn(async (input: ParticipantInput) =>
        participantRow(input)
      ),
      upsertTurn: vi.fn(async (input: TurnInput) => turnRow(input))
    };
    const service = new MultiAgentHarnessService(
      {} as never,
      database as never,
      repository as never
    );
    const assistantMessages = [
      groupEntry("msg_plan_r1", "agent_planner", "Planner", "第一轮规划", 0, 0),
      groupEntry("msg_exec_r1", "agent_executor", "Executor", "第一轮执行", 0, 1),
      groupEntry("msg_plan_r2", "agent_planner", "Planner", "第二轮规划", 1, 2),
      groupEntry("msg_exec_r2", "agent_executor", "Executor", "第二轮执行", 1, 3)
    ];

    await service.recordGroupExecution({
      assistantMessages,
      channelId: "conv_group",
      initialTargetAgentIds: ["agent_planner", "agent_executor"],
      mentionedAgentIds: [],
      ownerUserId: "user_owner",
      targets: [
        {
          agentId: "agent_planner",
          agentName: "Planner",
          capabilityTags: ["role:planning"],
          provider: "mock"
        },
        {
          agentId: "agent_executor",
          agentName: "Executor",
          capabilityTags: ["role:software-engineer"],
          provider: "mock"
        }
      ],
      userMessageId: "msg_user",
      workspaceId: "workspace_1"
    });

    const turns = repository.upsertTurn.mock.calls.map(
      ([input]) => input as TurnInput
    );

    expect(turns).toHaveLength(4);
    expect(turns.map((turn) => turn.producedEventIds?.[0])).toEqual([
      "event:message:msg_plan_r1",
      "event:message:msg_exec_r1",
      "event:message:msg_plan_r2",
      "event:message:msg_exec_r2"
    ]);
    expect(new Set(turns.map((turn) => turn.id)).size).toBe(4);
    expect(new Set(turns.map((turn) => turn.idempotencyKey)).size).toBe(4);
    expect(repository.upsertCausalChain).toHaveBeenLastCalledWith(
      expect.objectContaining({
        lastEventId: "event:message:msg_exec_r2",
        turnCount: 4
      }),
      tx
    );
  });
});

type ChannelEventInput = {
  authorId: string;
  authorType: "agent" | "human" | "system";
  causalChainId: string | null;
  channelId: string;
  content: string;
  createdAt?: string;
  eventType: string;
  id: string;
  mentions?: unknown[];
  parentEventId?: string | null;
  provenance: unknown;
  structuredPayload?: unknown;
  visibility?: string;
  workspaceId: string;
};

type ContextSnapshotInput = {
  agentParticipantId: string;
  agentTurnId: string;
  causalChainId: string;
  channelId: string;
  id: string;
  renderedPromptHash: string;
  renderedPromptPreview: string;
  sourceRefs: unknown[];
  tokenEstimate: unknown;
  workspaceId: string;
};

type ParticipantInput = {
  agentId: string;
  channelId: string;
  displayName: string;
  id: string;
  roleKey: string;
  roleLabel: string;
  roleTags: string[];
  workspaceId: string;
};

type TurnInput = {
  agentId: string;
  agentParticipantId: string;
  causalChainId: string;
  channelId: string;
  completedAt?: string | null;
  contextSnapshotId?: string | null;
  id: string;
  idempotencyKey: string;
  producedEventIds?: string[];
  priority: number;
  queuedAt?: string;
  reason: string;
  sourceAgentParticipantId?: string | null;
  startedAt?: string | null;
  status: string;
  triggeringEventId: string;
  workspaceId: string;
};

function groupEntry(
  messageId: string,
  agentId: string,
  agentName: string,
  finalContent: string,
  roundIndex: number,
  turnIndex: number
): {
  message: Message;
  result: OrchestratorResult;
} {
  return {
    message: assistantMessage(messageId, agentId, finalContent),
    result: {
      agentId,
      agentName,
      finalContent,
      provider: "mock",
      roundIndex,
      turnIndex
    }
  };
}

function assistantMessage(id: string, sourceAgentId: string, content: string): Message {
  return {
    author: null,
    authorUserId: null,
    content,
    conversationId: "conv_group",
    createdAt: new Date("2026-06-01T00:00:00.000Z"),
    id,
    isPinned: false,
    mentionedAgentIds: [],
    mentionedUserIds: [],
    ownerUserId: "user_owner",
    reactions: [],
    role: "assistant",
    sourceAgentId,
    threadLastReplyAt: null,
    threadParentMessageId: null,
    threadReplyCount: 0,
    workspaceId: "workspace_1"
  };
}

function channelEventRow(input: ChannelEventInput) {
  return {
    author_id: input.authorId,
    author_type: input.authorType,
    causal_chain_id: input.causalChainId,
    channel_id: input.channelId,
    content: input.content,
    created_at: new Date(input.createdAt ?? "2026-06-01T00:00:00.000Z"),
    event_type: input.eventType,
    id: input.id,
    mentions: input.mentions ?? [],
    parent_event_id: input.parentEventId ?? null,
    provenance: input.provenance,
    structured_payload: input.structuredPayload ?? {},
    visibility: input.visibility ?? "public",
    workspace_id: input.workspaceId
  };
}

function contextSnapshotRow(input: ContextSnapshotInput) {
  return {
    agent_participant_id: input.agentParticipantId,
    agent_turn_id: input.agentTurnId,
    causal_chain_id: input.causalChainId,
    channel_id: input.channelId,
    created_at: new Date("2026-06-01T00:00:00.000Z"),
    id: input.id,
    redactions: [],
    rendered_prompt_hash: input.renderedPromptHash,
    rendered_prompt_preview: input.renderedPromptPreview,
    source_refs: input.sourceRefs,
    token_estimate: input.tokenEstimate,
    workspace_id: input.workspaceId
  };
}

function participantRow(input: ParticipantInput) {
  return {
    agent_id: input.agentId,
    channel_id: input.channelId,
    created_at: new Date("2026-06-01T00:00:00.000Z"),
    display_name: input.displayName,
    id: input.id,
    memory_policy: {},
    read_cursor: {},
    role_contract: {},
    role_key: input.roleKey,
    role_label: input.roleLabel,
    role_tags: input.roleTags,
    status: "available",
    tool_policy_id: null,
    updated_at: new Date("2026-06-01T00:00:00.000Z"),
    workspace_id: input.workspaceId
  };
}

function turnRow(input: TurnInput) {
  return {
    agent_id: input.agentId,
    agent_participant_id: input.agentParticipantId,
    budget: {},
    causal_chain_id: input.causalChainId,
    channel_id: input.channelId,
    completed_at: input.completedAt ? new Date(input.completedAt) : null,
    context_snapshot_id: input.contextSnapshotId ?? null,
    error_code: null,
    error_message: null,
    id: input.id,
    idempotency_key: input.idempotencyKey,
    priority: input.priority,
    produced_event_ids: input.producedEventIds ?? [],
    queued_at: new Date(input.queuedAt ?? "2026-06-01T00:00:00.000Z"),
    reason: input.reason,
    runtime_policy_id: null,
    source_agent_participant_id: input.sourceAgentParticipantId ?? null,
    started_at: input.startedAt ? new Date(input.startedAt) : null,
    status: input.status,
    triggering_event_id: input.triggeringEventId,
    workspace_id: input.workspaceId
  };
}
