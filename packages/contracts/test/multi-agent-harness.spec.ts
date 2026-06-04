import { describe, expect, it } from "vitest";

import {
  multiAgentOutputEnvelopeSchema,
  multiAgentChannelEventSchema,
  multiAgentHandoffSchema,
  multiAgentParticipantSchema,
  multiAgentRunLedgerSchema,
  multiAgentTriggerPolicySchema
} from "../src/multi-agent-harness.js";

const now = "2026-06-01T00:00:00.000Z";

describe("multi-agent channel harness contracts", () => {
  it("keeps trigger policy conservative by default", () => {
    const policy = multiAgentTriggerPolicySchema.parse({});

    expect(policy).toMatchObject({
      allowBotOriginatedMentions: "handoff_only",
      maxSamePairPingPong: 3,
      maxTurnsPerCausalChain: 3,
      respondToAgentMentions: false,
      respondToAllAgents: false,
      respondToHumanMentions: true,
      respondToRoleMentions: true
    });
  });

  it("models an AI colleague as a configurable channel participant", () => {
    const participant = multiAgentParticipantSchema.parse({
      agentId: "agent_tech_lead",
      channelId: "conv_1",
      displayName: "TechLead",
      id: "participant_tech_lead",
      roleKey: "tech-lead",
      roleLabel: "技术负责人",
      workspaceId: "workspace_1"
    });

    expect(participant.roleContract).toMatchObject({
      owns: [],
      mustAskBefore: [],
      mustNotDo: []
    });
    expect(participant.triggerPolicy.respondToHumanMentions).toBe(true);
    expect(participant.readCursor).toEqual({
      beliefSnapshotId: null,
      lastSeenAt: null,
      lastSeenEventId: null
    });
  });

  it("serializes typed channel events with provenance and structured payload", () => {
    const event = multiAgentChannelEventSchema.parse({
      authorId: "agent_tech_lead",
      authorType: "agent",
      causalChainId: "chain_1",
      channelId: "conv_1",
      content: "我会把实现交接给工程同事。",
      createdAt: now,
      id: "event_handoff_requested",
      parentEventId: "event_plan",
      provenance: {
        sourceId: "turn_tech_lead_1",
        sourceType: "agent_model_output",
        verified: false
      },
      structuredPayload: {
        handoffId: "handoff_1",
        targetRoleKey: "software-engineer"
      },
      type: "handoff_requested",
      workspaceId: "workspace_1"
    });

    expect(event).toMatchObject({
      mentions: [],
      structuredPayload: {
        handoffId: "handoff_1"
      },
      visibility: "public"
    });
    expect(event.provenance.trustScore).toBeNull();
  });

  it("requires typed handoff payloads with acceptance criteria", () => {
    const handoff = multiAgentHandoffSchema.parse({
      causalChainId: "chain_1",
      channelId: "conv_1",
      createdAt: now,
      createdEventId: "event_handoff_requested",
      id: "handoff_1",
      payload: {
        acceptanceCriteria: ["补 API 测试", "补 Web 测试"],
        constraints: ["不要硬编码 AI 同事行为"],
        contextEventIds: ["event_plan"],
        goal: "实现频道内 AI 同事交接运行时",
        expectedArtifact: "passing tests"
      },
      sourceAgentParticipantId: "participant_tech_lead",
      status: "requested",
      targetAgentParticipantId: "participant_engineer",
      updatedAt: now,
      workspaceId: "workspace_1"
    });

    expect(handoff.payload.acceptanceCriteria).toHaveLength(2);
    expect(handoff.targetRoleKey).toBeNull();
  });

  it("serializes agent run ledger checkpoints", () => {
    const run = multiAgentRunLedgerSchema.parse({
      agentId: "agent_engineer",
      artifactCount: 1,
      channelId: "conv_1",
      checkpoint: "context_prepared",
      contextSnapshotId: null,
      createdAt: now,
      id: "agent-run:turn_1",
      metadata: { checkpointSource: "message_dispatch" },
      producedEventIds: [],
      provider: "codex",
      status: "running",
      turnId: "turn_1",
      updatedAt: now,
      workspaceId: "workspace_1"
    });

    expect(run).toMatchObject({
      checkpoint: "context_prepared",
      metadata: { checkpointSource: "message_dispatch" },
      status: "running"
    });
  });

  it("describes agent output envelopes with typed intents", () => {
    const envelope = multiAgentOutputEnvelopeSchema.parse({
      intents: [
        {
          acceptanceCriteria: ["Engineer turn queued"],
          constraints: ["普通文本 @ 不触发"],
          goal: "把实现交给工程同事",
          targetRoleKey: "software-engineer",
          type: "handoff_request"
        },
        {
          reason: "不需要工具调用",
          type: "no_action"
        }
      ],
      visibleMessage: "我会把实现任务交接给工程同事。"
    });

    expect(envelope.intents[0]).toMatchObject({
      targetRoleKey: "software-engineer",
      type: "handoff_request"
    });
  });
});
