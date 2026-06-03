import { describe, expect, it } from "vitest";

import type {
  MultiAgentChannelEvent,
  MultiAgentHandoff,
  MultiAgentParticipant,
  MultiAgentTurnCandidate
} from "@agenthub/contracts";

import {
  applyMultiAgentLoopGuard,
  approveProceduralMemory,
  assembleMultiAgentContext,
  createAgentTurnIdempotencyKey,
  createLoopGuardChannelEvent,
  createProceduralMemoryCandidate,
  computeTrajectoryMetrics,
  parseMultiAgentOutputEnvelope,
  recordProceduralMemoryUse,
  resolveMultiAgentMentions,
  selectMultiAgentTurnCandidates,
  transitionHandoff,
  verifyToolPlan
} from "../src/multi-agent/index.js";

const now = "2026-06-01T00:00:00.000Z";

describe("multi-agent channel harness domain", () => {
  it("resolves exact AI colleague, role, all-agents, and reply mentions", () => {
    const participants = [
      makeParticipant({
        displayName: "TechLead",
        id: "participant_tech_lead",
        roleKey: "tech-lead",
        roleTags: ["planner"]
      }),
      makeParticipant({
        displayName: "Reviewer",
        id: "participant_reviewer",
        roleKey: "reviewer"
      }),
      makeParticipant({
        displayName: "Engineer",
        id: "participant_engineer",
        roleKey: "software-engineer"
      }),
      makeParticipant({
        displayName: "QA",
        id: "participant_qa",
        roleKey: "qa"
      })
    ];

    const mentions = resolveMultiAgentMentions({
      allAgentsConfirmationThreshold: 3,
      content: "@TechLead 请拆任务，@reviewer 看风险，@all-agents 先准备。",
      participants,
      replyToParticipantId: "participant_engineer"
    });

    expect(mentions).toEqual([
      expect.objectContaining({
        kind: "agent",
        raw: "@TechLead",
        targetParticipantIds: ["participant_tech_lead"]
      }),
      expect.objectContaining({
        kind: "role",
        raw: "@reviewer",
        targetParticipantIds: ["participant_reviewer"]
      }),
      expect.objectContaining({
        kind: "all_agents",
        raw: "@all-agents",
        requiresHumanConfirmation: true,
        targetParticipantIds: [
          "participant_tech_lead",
          "participant_reviewer",
          "participant_engineer",
          "participant_qa"
        ]
      }),
      expect.objectContaining({
        kind: "reply_target",
        raw: "reply",
        targetParticipantIds: ["participant_engineer"]
      })
    ]);
  });

  it("schedules only human-mentioned AI colleagues and keeps idempotency stable", () => {
    const participants = [
      makeParticipant({
        agentId: "agent_tech_lead",
        displayName: "TechLead",
        id: "participant_tech_lead",
        roleKey: "tech-lead"
      }),
      makeParticipant({
        agentId: "agent_engineer",
        displayName: "Engineer",
        id: "participant_engineer",
        roleKey: "software-engineer"
      })
    ];
    const event = makeEvent({
      authorId: "user_1",
      authorType: "human",
      content: "@TechLead 请给计划。",
      id: "event_user_1",
      type: "user_message"
    });
    const mentions = resolveMultiAgentMentions({
      content: event.content,
      participants
    });
    const candidates = selectMultiAgentTurnCandidates({
      event,
      mentions,
      participants
    });

    expect(candidates).toEqual([
      expect.objectContaining({
        agentId: "agent_tech_lead",
        agentParticipantId: "participant_tech_lead",
        reason: "human_mention",
        sourceAgentParticipantId: null
      })
    ]);
    expect(createAgentTurnIdempotencyKey(candidates[0] as MultiAgentTurnCandidate)).toBe(
      createAgentTurnIdempotencyKey(candidates[0] as MultiAgentTurnCandidate)
    );
  });

  it("does not treat agent-authored text mentions as triggers, but typed handoff does", () => {
    const participants = [
      makeParticipant({
        agentId: "agent_engineer",
        displayName: "Engineer",
        id: "participant_engineer",
        roleKey: "software-engineer"
      })
    ];
    const textMentionEvent = makeEvent({
      authorId: "agent_tech_lead",
      authorType: "agent",
      content: "@Engineer 可以看看这个。",
      type: "agent_message"
    });
    const textMentions = resolveMultiAgentMentions({
      content: textMentionEvent.content,
      participants
    });

    expect(
      selectMultiAgentTurnCandidates({
        event: textMentionEvent,
        mentions: textMentions,
        participants
      })
    ).toEqual([]);

    const handoffEvent = makeEvent({
      authorId: "agent_tech_lead",
      authorType: "agent",
      content: "任务交接给 Engineer。",
      structuredPayload: {
        targetParticipantId: "participant_engineer"
      },
      type: "handoff_requested"
    });

    expect(
      selectMultiAgentTurnCandidates({
        event: handoffEvent,
        mentions: [],
        participants
      })
    ).toEqual([
      expect.objectContaining({
        agentParticipantId: "participant_engineer",
        reason: "agent_handoff",
        sourceAgentParticipantId: "agent_tech_lead"
      })
    ]);
  });

  it("blocks muted agents, paused chains, excessive turns, and same-pair ping-pong", () => {
    const participant = makeParticipant({
      agentId: "agent_engineer",
      id: "participant_engineer",
      roleKey: "software-engineer",
      triggerPolicy: {
        maxSamePairPingPong: 3
      }
    });
    const candidate = makeCandidate({
      agentId: "agent_engineer",
      agentParticipantId: "participant_engineer",
      sourceAgentParticipantId: "agent_reviewer"
    });

    expect(
      applyMultiAgentLoopGuard({
        candidate,
        causalChain: {
          ...makeChain(),
          status: "paused"
        },
        events: [],
        participant
      })
    ).toEqual({
      action: "block",
      guard: "chain_paused",
      suggestedActions: ["resume_chain", "summarize", "stop_chain"]
    });

    expect(
      applyMultiAgentLoopGuard({
        candidate,
        causalChain: makeChain(),
        events: [],
        participant: {
          ...participant,
          status: "muted"
        }
      })
    ).toEqual({
      action: "block",
      guard: "muted_agent",
      suggestedActions: ["unmute_agent", "skip_turn"]
    });

    expect(
      applyMultiAgentLoopGuard({
        candidate,
        causalChain: {
          ...makeChain(),
          turnCount: 8
        },
        events: [],
        participant
      })
    ).toMatchObject({
      action: "block",
      guard: "max_turns_per_chain"
    });

    expect(
      applyMultiAgentLoopGuard({
        candidate,
        causalChain: makeChain(),
        events: [
          makeEvent({ authorId: "user_1", authorType: "human", id: "event_user" }),
          makeEvent({ authorId: "agent_engineer", authorType: "agent", id: "event_a1" }),
          makeEvent({ authorId: "agent_reviewer", authorType: "agent", id: "event_b1" }),
          makeEvent({ authorId: "agent_engineer", authorType: "agent", id: "event_a2" })
        ],
        participant
      })
    ).toMatchObject({
      action: "block",
      guard: "same_pair_ping_pong"
    });
  });

  it("creates loop guard events for traceable blocked turns", () => {
    const event = createLoopGuardChannelEvent({
      blockedParticipantIds: ["participant_engineer"],
      causalChainId: "chain_1",
      channelId: "conv_1",
      guard: "same_pair_ping_pong",
      id: "event_loop_guard",
      now,
      parentEventId: "event_reviewer",
      suggestedActions: ["summarize", "continue_once"],
      workspaceId: "workspace_1"
    });

    expect(event).toMatchObject({
      authorId: "multi-agent-scheduler",
      authorType: "system",
      structuredPayload: {
        blockedParticipantIds: ["participant_engineer"],
        guard: "same_pair_ping_pong"
      },
      type: "loop_guard_triggered"
    });
  });

  it("transitions handoffs through requested, accepted, completed, rejected, and expired states", () => {
    const requested = makeHandoff();
    const accepted = transitionHandoff({
      eventId: "event_accept",
      handoff: requested,
      now,
      transition: "accept"
    });
    const completed = transitionHandoff({
      eventId: "event_complete",
      handoff: accepted,
      now,
      transition: "complete"
    });
    const rejected = transitionHandoff({
      eventId: "event_reject",
      handoff: requested,
      now,
      transition: "reject"
    });
    const expired = transitionHandoff({
      handoff: requested,
      now,
      transition: "expire"
    });

    expect(accepted.status).toBe("accepted");
    expect(accepted.acceptedEventId).toBe("event_accept");
    expect(completed.status).toBe("completed");
    expect(completed.completedEventId).toBe("event_complete");
    expect(rejected.status).toBe("rejected");
    expect(expired.status).toBe("expired");
    expect(() =>
      transitionHandoff({
        handoff: completed,
        now,
        transition: "reject"
      })
    ).toThrow(/Cannot transition handoff/);
  });

  it("assembles context snapshots without leaking other agents private memory", () => {
    const participant = makeParticipant({
      agentId: "agent_engineer",
      displayName: "Engineer",
      id: "participant_engineer",
      roleKey: "software-engineer",
      roleContract: {
        owns: ["implementation"],
        mustNotDo: ["hardcode colleague behavior"]
      }
    });
    const triggeringEvent = makeEvent({
      content: "@Engineer 实现这个方案。",
      id: "event_user_1"
    });
    const context = assembleMultiAgentContext({
      budget: {
        maxSourceRefs: 8,
        maxTotalChars: 2000
      },
      causalChain: makeChain(),
      events: [
        triggeringEvent,
        makeEvent({
          content: "Engineer private note",
          id: "event_private_other",
          visibility: "agent_private"
        }),
        makeEvent({
          content: "公共历史",
          id: "event_public_history"
        })
      ],
      participant,
      privateMemory: [
        {
          id: "memory_private_engineer",
          ownerParticipantId: "participant_engineer",
          status: "approved",
          summary: "用户偏好先给结论"
        },
        {
          id: "memory_private_reviewer",
          ownerParticipantId: "participant_reviewer",
          status: "approved",
          summary: "Reviewer private memory"
        }
      ],
      proceduralMemories: [
        {
          id: "procedure_approved",
          ownerRoleKey: "software-engineer",
          status: "approved",
          summary: "实现前先补测试"
        },
        {
          id: "procedure_candidate",
          ownerRoleKey: "software-engineer",
          status: "candidate",
          summary: "未批准流程"
        }
      ],
      triggeringEvent,
      turn: makeCandidate({
        agentId: "agent_engineer",
        agentParticipantId: "participant_engineer",
        triggeringEventId: triggeringEvent.id
      })
    });

    expect(context.snapshot.sourceRefs.map((source) => source.type)).toContain(
      "role_contract"
    );
    expect(context.snapshot.sourceRefs.map((source) => source.refId)).toContain(
      "event_user_1"
    );
    expect(context.renderedPromptPreview).toContain("hardcode colleague behavior");
    expect(context.renderedPromptPreview).toContain("公共历史");
    expect(context.renderedPromptPreview).toContain("用户偏好先给结论");
    expect(context.renderedPromptPreview).toContain("实现前先补测试");
    expect(context.renderedPromptPreview).not.toContain("Reviewer private memory");
    expect(context.renderedPromptPreview).not.toContain("未批准流程");
  });

  it("verifies tool plans against risk and role policy", () => {
    expect(
      verifyToolPlan({
        plan: {
          calls: [],
          expectedSideEffects: [],
          id: "tool_plan_forbidden",
          proposedByAgentId: "agent_engineer",
          riskLevel: "forbidden",
          rollbackPlan: null,
          summary: "Disable audit logs"
        },
        policy: makePermissionPolicy()
      })
    ).toMatchObject({
      verdict: "deny",
      detectedRisks: ["forbidden_tool"]
    });

    expect(
      verifyToolPlan({
        plan: {
          calls: [],
          expectedSideEffects: ["deploy preview"],
          id: "tool_plan_high",
          proposedByAgentId: "agent_engineer",
          riskLevel: "high",
          rollbackPlan: null,
          summary: "Deploy without rollback"
        },
        policy: makePermissionPolicy({
          allowedToolRisk: "high_with_approval"
        })
      })
    ).toMatchObject({
      verdict: "needs_human_approval",
      detectedRisks: ["missing_rollback"]
    });

    expect(
      verifyToolPlan({
        plan: {
          calls: [],
          expectedSideEffects: ["write local patch"],
          id: "tool_plan_medium",
          proposedByAgentId: "agent_engineer",
          riskLevel: "medium",
          rollbackPlan: "revert patch",
          summary: "Edit local files"
        },
        policy: makePermissionPolicy({
          allowedToolRisk: "low"
        })
      })
    ).toMatchObject({
      verdict: "needs_human_approval",
      detectedRisks: ["policy_exceeds_allowed_risk"]
    });
  });

  it("creates procedural memory as candidate and requires approval before use", () => {
    const candidate = createProceduralMemoryCandidate({
      causalChainId: "chain_1",
      id: "procedure_1",
      now,
      ownerRoleKey: "software-engineer",
      steps: [
        {
          description: "Write regression test first",
          expectedOutputs: ["failing test"],
          id: "step_1",
          requiredInputs: ["bug report"],
          title: "补测试",
          verification: ["test fails before fix"]
        }
      ],
      summary: "先测后改",
      title: "回归修复流程",
      workspaceId: "workspace_1"
    });
    const approved = approveProceduralMemory({
      memory: candidate,
      now
    });
    const afterFailure = recordProceduralMemoryUse({
      memory: approved,
      now,
      outcome: "failure"
    });

    expect(candidate.status).toBe("candidate");
    expect(approved.status).toBe("approved");
    expect(afterFailure.failureCount).toBe(1);
    expect(afterFailure.successCount).toBe(0);
  });

  it("computes trajectory metrics from typed events, turns, and handoffs", () => {
    const metrics = computeTrajectoryMetrics({
      events: [
        makeEvent({ authorId: "user_1", authorType: "human", id: "event_user" }),
        makeEvent({ id: "event_handoff", type: "handoff_requested" }),
        makeEvent({ id: "event_loop", type: "loop_guard_triggered" })
      ],
      finalOutcome: "partial",
      handoffs: [
        {
          ...makeHandoff(),
          status: "completed"
        },
        {
          ...makeHandoff({ id: "handoff_2" }),
          status: "rejected"
        }
      ],
      turns: [
        makeCandidate({ agentParticipantId: "participant_tech_lead" }),
        makeCandidate({
          agentParticipantId: "participant_engineer",
          sourceAgentParticipantId: "participant_tech_lead"
        })
      ]
    });

    expect(metrics).toMatchObject({
      agentToAgentTurnCount: 1,
      finalOutcome: "partial",
      handoffCount: 2,
      handoffSuccessRate: 0.5,
      humanInterventionCount: 1,
      loopGuardTriggered: true,
      turnCount: 2
    });
  });

  it("parses typed agent output envelopes and safely degrades invalid output", () => {
    const parsed = parseMultiAgentOutputEnvelope({
      rawText: [
        "我会把实现交接给工程同事。",
        "```json",
        "{",
        '  "visibleMessage": "我会把实现交接给工程同事。",',
        '  "intents": [',
        "    {",
        '      "type": "handoff_request",',
        '      "targetRoleKey": "software-engineer",',
        '      "goal": "实现频道内交接",',
        '      "acceptanceCriteria": ["queued turn"],',
        '      "constraints": ["不要硬编码同事行为"]',
        "    }",
        "  ]",
        "}",
        "```"
      ].join("\n")
    });

    expect(parsed.errors).toEqual([]);
    expect(parsed.envelope.intents).toEqual([
      expect.objectContaining({
        targetRoleKey: "software-engineer",
        type: "handoff_request"
      })
    ]);

    const trailingJson = parseMultiAgentOutputEnvelope({
      rawText: [
        "我会把实现交接给工程同事。",
        "{",
        '  "visibleMessage": "我会把实现交接给工程同事。",',
        '  "intents": [',
        "    {",
        '      "type": "handoff_request",',
        '      "targetRoleKey": "software-engineer",',
        '      "goal": "实现频道内交接",',
        '      "acceptanceCriteria": ["queued turn"]',
        "    }",
        "  ]",
        "}"
      ].join("\n")
    });

    expect(trailingJson.errors).toEqual([]);
    expect(trailingJson.envelope.intents[0]).toMatchObject({
      targetRoleKey: "software-engineer",
      type: "handoff_request"
    });

    const fallback = parseMultiAgentOutputEnvelope({
      rawText: "普通文本 @Engineer 不应该触发交接"
    });

    expect(fallback.envelope).toEqual({
      intents: [],
      visibleMessage: "普通文本 @Engineer 不应该触发交接"
    });
    expect(fallback.errors).toContain("No parseable multi-agent output envelope found.");
  });
});

function makeParticipant(
  overrides: Partial<MultiAgentParticipant> = {}
): MultiAgentParticipant {
  return {
    agentId: overrides.agentId ?? "agent_1",
    aliases: overrides.aliases ?? [],
    channelId: overrides.channelId ?? "conv_1",
    createdAt: overrides.createdAt ?? now,
    displayName: overrides.displayName ?? "AI 同事",
    id: overrides.id ?? "participant_1",
    memoryPolicy: overrides.memoryPolicy ?? {
      canReadChannelMemory: true,
      canReadOwnPrivateMemory: true,
      canReadProceduralMemory: true,
      canWriteCandidateMemory: true
    },
    readCursor: overrides.readCursor ?? {
      beliefSnapshotId: null,
      lastSeenAt: null,
      lastSeenEventId: null
    },
    roleContract: {
      defaultHandoffTargets: [],
      doesNotOwn: [],
      mustAskBefore: [],
      mustNotDo: [],
      owns: [],
      responseStyle: {
        avoidSpeculationWithoutLabel: true,
        requireActionableNextStep: true
      },
      stopConditions: [],
      ...overrides.roleContract
    },
    roleKey: overrides.roleKey ?? "generalist",
    roleLabel: overrides.roleLabel ?? "AI 同事",
    roleTags: overrides.roleTags ?? [],
    status: overrides.status ?? "available",
    toolPolicyId: overrides.toolPolicyId ?? null,
    triggerPolicy: {
      allowBotOriginatedMentions: "handoff_only",
      cooldownSeconds: 15,
      maxTurnsPerCausalChain: 3,
      maxTurnsPerHour: 30,
      respondToAgentMentions: false,
      respondToAllAgents: false,
      respondToHumanMentions: true,
      respondToReplyToSelf: true,
      respondToRoleMentions: true,
      ...overrides.triggerPolicy
    },
    updatedAt: overrides.updatedAt ?? now,
    workspaceId: overrides.workspaceId ?? "workspace_1"
  };
}

function makeEvent(
  overrides: Partial<MultiAgentChannelEvent> = {}
): MultiAgentChannelEvent {
  return {
    authorId: overrides.authorId ?? "user_1",
    authorType: overrides.authorType ?? "human",
    causalChainId: overrides.causalChainId ?? "chain_1",
    channelId: overrides.channelId ?? "conv_1",
    content: overrides.content ?? "hello",
    createdAt: overrides.createdAt ?? now,
    id: overrides.id ?? "event_1",
    mentions: overrides.mentions ?? [],
    parentEventId: overrides.parentEventId ?? null,
    provenance: overrides.provenance ?? {
      confidence: null,
      sourceId: null,
      sourceType: "human_input",
      trustScore: null,
      verificationRefs: [],
      verified: false
    },
    structuredPayload: overrides.structuredPayload ?? {},
    type: overrides.type ?? "user_message",
    visibility: overrides.visibility ?? "public",
    workspaceId: overrides.workspaceId ?? "workspace_1"
  };
}

function makeCandidate(
  overrides: Partial<MultiAgentTurnCandidate> = {}
): MultiAgentTurnCandidate {
  return {
    agentId: overrides.agentId ?? "agent_1",
    agentParticipantId: overrides.agentParticipantId ?? "participant_1",
    causalChainId: overrides.causalChainId ?? "chain_1",
    channelId: overrides.channelId ?? "conv_1",
    priority: overrides.priority ?? 100,
    reason: overrides.reason ?? "human_mention",
    sourceAgentParticipantId: overrides.sourceAgentParticipantId ?? null,
    triggeringEventId: overrides.triggeringEventId ?? "event_1",
    workspaceId: overrides.workspaceId ?? "workspace_1"
  };
}

function makeChain() {
  return {
    agentToAgentTurnCount: 0,
    channelId: "conv_1",
    createdAt: now,
    id: "chain_1",
    lastEventId: null,
    maxAgentToAgentTurns: 5,
    maxTurns: 8,
    rootEventId: "event_1",
    status: "open" as const,
    summary: null,
    turnCount: 0,
    updatedAt: now,
    workspaceId: "workspace_1"
  };
}

function makeHandoff(overrides: Partial<MultiAgentHandoff> = {}): MultiAgentHandoff {
  return {
    acceptedEventId: overrides.acceptedEventId ?? null,
    causalChainId: overrides.causalChainId ?? "chain_1",
    channelId: overrides.channelId ?? "conv_1",
    completedEventId: overrides.completedEventId ?? null,
    createdAt: overrides.createdAt ?? now,
    createdEventId: overrides.createdEventId ?? "event_handoff",
    id: overrides.id ?? "handoff_1",
    payload: overrides.payload ?? {
      acceptanceCriteria: ["tests pass"],
      constraints: ["no hardcoded colleague behavior"],
      contextEventIds: ["event_plan"],
      goal: "implement runtime"
    },
    sourceAgentParticipantId:
      overrides.sourceAgentParticipantId ?? "participant_tech_lead",
    status: overrides.status ?? "requested",
    targetAgentParticipantId:
      overrides.targetAgentParticipantId ?? "participant_engineer",
    targetRoleKey: overrides.targetRoleKey ?? null,
    updatedAt: overrides.updatedAt ?? now,
    workspaceId: overrides.workspaceId ?? "workspace_1"
  };
}

function makePermissionPolicy(
  overrides: Partial<ReturnType<typeof makePermissionPolicyBase>> = {}
) {
  return {
    ...makePermissionPolicyBase(),
    ...overrides
  };
}

function makePermissionPolicyBase() {
  return {
    allowedToolRisk: "low" as const,
    canCreateToolPlan: true,
    canInitiateHandoff: true,
    canMentionAgents: true,
    canMentionAllAgents: false,
    canMentionRoles: true,
    canReadChannel: true,
    canWriteChannel: true,
    memoryReadScopes: ["own_private", "channel", "procedural"] as const,
    memoryWriteScopes: ["candidate_private", "procedural_candidate"] as const,
    participantId: "participant_engineer"
  };
}
