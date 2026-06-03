import { describe, expect, it } from "vitest";

import {
  agentActorActiveHoursSchema,
  agentActorChannelEventSchema,
  agentActorHeartbeatPolicySchema,
  agentActorMailboxEventSchema,
  agentActorParticipantSchema,
  agentActorRuntimeProfileSchema,
  agentActorSessionSchema,
  agentActorTriggerPolicySchema,
  agentActorWakeDecisionSchema,
  agentActorWakeRunSchema
} from "../src";

const now = "2026-05-31T00:00:00.000Z";

describe("agent actor runtime contracts", () => {
  it("describes isolated runtime profiles for memory, sessions, skills, and gateways", () => {
    const profile = agentActorRuntimeProfileSchema.parse({
      agentId: "agent_alpha",
      gatewayChannelIds: ["channel_web", "channel_slack"],
      id: "profile_alpha",
      memoryNamespace: "workspace_1/agents/agent_alpha/memory",
      sessionNamespace: "workspace_1/agents/agent_alpha/sessions",
      skillNamespace: "workspace_1/agents/agent_alpha/skills",
      toolsetIds: ["toolset_user_defined_alpha"],
      workspaceId: "workspace_1"
    });

    expect(profile.memoryNamespace).not.toBe(profile.skillNamespace);
    expect(profile.gatewayChannelIds).toEqual(["channel_web", "channel_slack"]);
  });

  it("applies safe heartbeat, checkpoint, and compression defaults to actor sessions", () => {
    const session = agentActorSessionSchema.parse({
      agentId: "agent_1",
      conversationId: "conv_1",
      createdAt: now,
      id: "actor_session_1",
      profileId: "profile_1",
      updatedAt: now,
      workspaceId: "workspace_1"
    });

    expect(session.status).toBe("idle");
    expect(session.heartbeatPolicy).toMatchObject({
      enabled: true,
      intervalMs: 30 * 60 * 1000,
      lightContext: true,
      maxWakeRunsPerHour: 6,
      skipWhenBusy: true,
      target: "none"
    });
    expect(session.checkpointPolicy).toMatchObject({
      beforeExternalWrite: true,
      beforeLocalWrite: true,
      rollbackOnFailure: true
    });
    expect(session.compressionPolicy).toMatchObject({
      enabled: true,
      preserveFirstTurns: 2,
      preserveLastTurns: 6
    });
  });

  it("keeps mailbox events explicit and serializable", () => {
    const event = agentActorMailboxEventSchema.parse({
      agentId: "agent_1",
      availableAt: now,
      conversationId: "conv_1",
      createdAt: now,
      id: "event_1",
      kind: "handoff_artifact",
      payload: {
        artifactKind: "technical_handoff",
        artifactRef: "artifact_1"
      },
      sessionId: "actor_session_1",
      sourceAgentId: "agent_planner",
      sourceRunId: "run_planner",
      workspaceId: "workspace_1"
    });

    expect(event.status).toBe("queued");
    expect(event.payload).toEqual({
      artifactKind: "technical_handoff",
      artifactRef: "artifact_1"
    });
  });

  it("describes public channel events, mentions, and agent trigger policies separately", () => {
    const event = agentActorChannelEventSchema.parse({
      author: {
        id: "agent_alpha",
        type: "agent"
      },
      causalChainId: "chain_1",
      channelId: "channel_1",
      content: "@Beta 请根据自定义职责处理这个交接。",
      createdAt: now,
      id: "channel_event_1",
      mentions: [
        {
          rawText: "@Beta",
          targetId: "agent_beta",
          targetType: "agent"
        }
      ],
      type: "agent_message",
      workspaceId: "workspace_1"
    });
    const participant = agentActorParticipantSchema.parse({
      agentId: "agent_beta",
      behaviorRef: "agent-behavior:beta:v1",
      channelId: "channel_1",
      displayName: "自定义同事 Beta",
      id: "participant_beta",
      memoryScope: "channel",
      role: "user_defined_beta",
      roleTags: ["user-defined", "handoff-target"],
      templateId: "template:user-owned",
      toolPolicyId: "tool-policy:beta",
      triggerPolicy: {
        botOriginatedMentionPolicy: "explicit",
        respondToAgentMentions: true
      },
      workspaceId: "workspace_1"
    });

    expect(event.visibility).toBe("public");
    expect(participant.triggerPolicy).toMatchObject({
      botOriginatedMentionPolicy: "explicit",
      maxSamePairPingPong: 3,
      respondToAgentMentions: true,
      respondToHumanMentions: true
    });
    expect(participant).toMatchObject({
      behaviorRef: "agent-behavior:beta:v1",
      memoryScope: "channel",
      templateId: "template:user-owned",
      toolPolicyId: "tool-policy:beta"
    });
    expect(participant.roleContract.owns).toEqual([]);
  });

  it("defaults bot-origin mentions to blocked unless an agent opts in", () => {
    const policy = agentActorTriggerPolicySchema.parse({});

    expect(policy).toMatchObject({
      botOriginatedMentionPolicy: "never",
      respondToAgentMentions: false,
      respondToAllAgents: false,
      respondToHumanMentions: true
    });
  });

  it("represents wake decisions and wake runs without implying committed side effects", () => {
    const decision = agentActorWakeDecisionSchema.parse({
      action: "wake",
      reason: "memory_review_due",
      selectedEventIds: ["event_memory"],
      shouldCallModel: true,
      shouldEmitMessage: false
    });
    const run = agentActorWakeRunSchema.parse({
      agentId: "agent_1",
      decision,
      id: "wake_run_1",
      selectedEventIds: decision.selectedEventIds,
      sessionId: "actor_session_1",
      startedAt: now,
      status: "started",
      workspaceId: "workspace_1"
    });

    expect(run.modelCalled).toBe(false);
    expect(run.messageEmitted).toBe(false);
    expect(run.completedAt).toBeNull();
  });

  it("rejects invalid heartbeat policies and zero-width active-hour windows", () => {
    expect(() =>
      agentActorHeartbeatPolicySchema.parse({
        intervalMs: 0
      })
    ).toThrow();
    expect(() =>
      agentActorActiveHoursSchema.parse({
        end: "09:00",
        start: "09:00",
        timezone: "Australia/Sydney"
      })
    ).toThrow();
    expect(() =>
      agentActorActiveHoursSchema.parse({
        end: "24:30",
        start: "09:00",
        timezone: "Australia/Sydney"
      })
    ).toThrow();
    expect(() =>
      agentActorActiveHoursSchema.parse({
        end: "02:00",
        start: "24:00",
        timezone: "Australia/Sydney"
      })
    ).toThrow();
  });
});
