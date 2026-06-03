import {
  agentActorChannelEventSchema,
  agentActorMailboxEventSchema,
  agentActorParticipantSchema,
  agentActorSessionSchema,
  agentActorWakeRunSchema
} from "@agenthub/contracts";
import type {
  AgentActorChannelEvent,
  AgentActorMailboxEvent,
  AgentActorMailboxEventKind,
  AgentActorParticipant,
  AgentActorSession,
  AgentActorWakeRun
} from "@agenthub/contracts";
import { describe, expect, it } from "vitest";

import {
  createAgentActorHeartbeatTickEvent,
  createAgentActorMailboxEventFromTurnCandidate,
  createAgentActorWakeRun,
  evaluateAgentActorLoopGuard,
  interpretAgentActorHeartbeatResponse,
  isAgentActorBusyStatus,
  markAgentActorHeartbeatObserved,
  markAgentActorIdle,
  markAgentActorRunning,
  selectAgentActorTurnCandidates,
  selectAgentActorWakeDecision,
  sortAgentActorMailboxEvents
} from "../src/agent-runtime/index.js";

const now = "2026-05-31T00:00:00.000Z";
const oneMinuteAgo = "2026-05-30T23:59:00.000Z";
const thirtyOneMinutesAgo = "2026-05-30T23:29:00.000Z";

describe("agent actor runtime", () => {
  it("sorts mailbox events by semantic priority before heartbeat ticks", () => {
    const heartbeat = makeEvent({
      createdAt: "2026-05-30T23:55:00.000Z",
      id: "event_heartbeat",
      kind: "heartbeat_tick"
    });
    const handoff = makeEvent({
      createdAt: "2026-05-30T23:57:00.000Z",
      id: "event_handoff",
      kind: "handoff_artifact"
    });
    const userMessage = makeEvent({
      createdAt: "2026-05-30T23:59:00.000Z",
      id: "event_user",
      kind: "user_message"
    });

    expect(
      sortAgentActorMailboxEvents([heartbeat, handoff, userMessage]).map(
        (event) => event.id
      )
    ).toEqual(["event_user", "event_handoff", "event_heartbeat"]);
  });

  it("wakes for user messages even when heartbeat is disabled", () => {
    const session = makeSession({
      heartbeatPolicy: {
        enabled: false
      }
    });
    const decision = selectAgentActorWakeDecision({
      mailboxEvents: [makeEvent({ kind: "user_message" })],
      now,
      session
    });

    expect(decision).toMatchObject({
      action: "wake",
      reason: "user_message",
      shouldCallModel: true,
      shouldEmitMessage: true
    });
  });

  it("wakes consumers when a handoff artifact arrives from another agent", () => {
    const event = makeEvent({
      id: "event_handoff",
      kind: "handoff_artifact",
      payload: {
        artifactKind: "technical_handoff",
        artifactRef: "artifact_plan"
      },
      sourceAgentId: "agent_planner"
    });
    const decision = selectAgentActorWakeDecision({
      mailboxEvents: [event],
      now,
      session: makeSession()
    });

    expect(decision).toMatchObject({
      action: "wake",
      reason: "handoff_artifact",
      selectedEventIds: ["event_handoff"]
    });
  });

  it("selects only explicitly mentioned agents for human-origin channel events", () => {
    const candidates = selectAgentActorTurnCandidates({
      event: makeChannelEvent({
        author: {
          id: "user_1",
          type: "human"
        },
        mentions: [
          {
            rawText: "@Alpha",
            targetId: "agent_alpha",
            targetType: "agent"
          }
        ]
      }),
      participants: [
        makeParticipant({
          agentId: "agent_alpha",
          id: "participant_alpha",
          role: "custom_alpha"
        }),
        makeParticipant({
          agentId: "agent_beta",
          id: "participant_beta",
          role: "custom_beta"
        })
      ]
    });

    expect(candidates).toEqual([
      expect.objectContaining({
        agentId: "agent_alpha",
        reason: "human_mention",
        sourceAgentId: null
      })
    ]);
  });

  it("blocks agent-origin mentions by default to prevent bot cascades", () => {
    const candidates = selectAgentActorTurnCandidates({
      event: makeChannelEvent({
        author: {
          id: "agent_alpha",
          type: "agent"
        },
        mentions: [
          {
            rawText: "@Beta",
            targetId: "agent_beta",
            targetType: "agent"
          }
        ]
      }),
      participants: [
        makeParticipant({
          agentId: "agent_beta",
          id: "participant_beta",
          role: "custom_beta"
        })
      ]
    });

    expect(candidates).toEqual([]);
  });

  it("allows explicit agent-to-agent mentions when the target policy opts in", () => {
    const candidates = selectAgentActorTurnCandidates({
      event: makeChannelEvent({
        author: {
          id: "agent_alpha",
          type: "agent"
        },
        causalChainId: "chain_1",
        mentions: [
          {
            rawText: "@Beta",
            targetId: "agent_beta",
            targetType: "agent"
          }
        ]
      }),
      participants: [
        makeParticipant({
          agentId: "agent_beta",
          id: "participant_beta",
          role: "custom_beta",
          triggerPolicy: {
            botOriginatedMentionPolicy: "explicit",
            respondToAgentMentions: true
          }
        })
      ]
    });

    expect(candidates).toEqual([
      expect.objectContaining({
        agentId: "agent_beta",
        causalChainId: "chain_1",
        reason: "agent_mention",
        sourceAgentId: "agent_alpha"
      })
    ]);
  });

  it("allows handoff channel events to trigger a target agent without general bot mention permission", () => {
    const candidates = selectAgentActorTurnCandidates({
      event: makeChannelEvent({
        author: {
          id: "agent_alpha",
          type: "agent"
        },
        mentions: [
          {
            rawText: "@Beta",
            targetId: "agent_beta",
            targetType: "agent"
          }
        ],
        type: "handoff"
      }),
      participants: [
        makeParticipant({
          agentId: "agent_beta",
          id: "participant_beta",
          role: "custom_beta"
        })
      ]
    });

    expect(candidates).toEqual([
      expect.objectContaining({
        agentId: "agent_beta",
        reason: "handoff",
        sourceAgentId: "agent_alpha"
      })
    ]);
  });

  it("resolves role mentions through participant role tags", () => {
    const candidates = selectAgentActorTurnCandidates({
      event: makeChannelEvent({
        author: {
          id: "user_1",
          type: "human"
        },
        mentions: [
          {
            rawText: "@custom-specialist",
            targetId: "custom-specialist",
            targetType: "role"
          }
        ]
      }),
      participants: [
        makeParticipant({
          agentId: "agent_gamma",
          id: "participant_gamma",
          role: "custom_gamma",
          roleTags: ["custom-specialist", "policy-check"]
        }),
        makeParticipant({
          agentId: "agent_beta",
          id: "participant_beta",
          role: "custom_beta",
          roleTags: ["another-user-defined-tag"]
        })
      ]
    });

    expect(candidates.map((candidate) => candidate.agentId)).toEqual([
      "agent_gamma"
    ]);
    expect(candidates[0]).toMatchObject({
      reason: "role_mention"
    });
  });

  it("does not treat public channel visibility as a speak trigger by itself", () => {
    const candidates = selectAgentActorTurnCandidates({
      event: makeChannelEvent({
        author: {
          id: "user_1",
          type: "human"
        },
        mentions: []
      }),
      participants: [
        makeParticipant({
          agentId: "agent_alpha",
          id: "participant_alpha",
          role: "custom_alpha"
        })
      ]
    });

    expect(candidates).toEqual([]);
  });

  it("maps allowed channel turns into mailbox events with causal metadata", () => {
    const event = makeChannelEvent({
      author: {
        id: "agent_alpha",
        type: "agent"
      },
      causalChainId: "chain_1",
      content: "@Beta 请处理这个用户定义的交接。",
      id: "channel_event_handoff",
      mentions: [
        {
          rawText: "@Beta",
          targetId: "agent_beta",
          targetType: "agent"
        }
      ],
      type: "handoff"
    });
    const candidate = selectAgentActorTurnCandidates({
      event,
      participants: [
        makeParticipant({
          agentId: "agent_beta",
          id: "participant_beta",
          role: "custom_beta"
        })
      ]
    })[0];

    if (!candidate) {
      throw new Error("Expected a turn candidate for the handoff event.");
    }

    const mailboxEvent = createAgentActorMailboxEventFromTurnCandidate({
      candidate,
      event,
      id: "mailbox_event_1",
      now,
      sessionId: "actor_session_beta"
    });

    expect(mailboxEvent).toMatchObject({
      agentId: "agent_beta",
      dedupeKey: "channel-turn:channel_event_handoff:agent_beta",
      kind: "handoff_artifact",
      payload: {
        causalChainId: "chain_1",
        channelEventId: "channel_event_handoff",
        triggerReason: "handoff"
      },
      sourceAgentId: "agent_alpha"
    });
  });

  it("loop guard skips muted and offline agents even when they are mentioned", () => {
    const event = makeChannelEvent();
    const candidate = {
      agentId: "agent_beta",
      causalChainId: event.id,
      channelId: event.channelId,
      priority: 100,
      reason: "human_mention" as const,
      sourceAgentId: null,
      triggeringEventId: event.id,
      workspaceId: event.workspaceId
    };

    expect(
      evaluateAgentActorLoopGuard({
        candidate,
        causalChainEvents: [event],
        now,
        participant: makeParticipant({
          agentId: "agent_beta",
          id: "participant_beta",
          role: "custom_beta",
          status: "muted"
        })
      })
    ).toEqual({
      action: "skip",
      skipReason: "muted"
    });
    expect(
      evaluateAgentActorLoopGuard({
        candidate,
        causalChainEvents: [event],
        now,
        participant: makeParticipant({
          agentId: "agent_beta",
          id: "participant_beta",
          role: "custom_beta",
          status: "offline"
        })
      })
    ).toEqual({
      action: "skip",
      skipReason: "offline"
    });
  });

  it("loop guard caps same-pair agent ping-pong", () => {
    const event = makeChannelEvent({
      author: {
        id: "agent_gamma",
        type: "agent"
      },
      causalChainId: "chain_ping_pong",
      id: "event_gamma_latest"
    });
    const candidate = {
      agentId: "agent_beta",
      causalChainId: "chain_ping_pong",
      channelId: event.channelId,
      priority: 80,
      reason: "agent_mention" as const,
      sourceAgentId: "agent_gamma",
      triggeringEventId: event.id,
      workspaceId: event.workspaceId
    };
    const chainEvents = [
      makeChannelEvent({
        author: {
          id: "user_1",
          type: "human"
        },
        causalChainId: "chain_ping_pong",
        id: "event_user"
      }),
      makeChannelEvent({
        author: {
          id: "agent_beta",
          type: "agent"
        },
        causalChainId: "chain_ping_pong",
        id: "event_beta_1"
      }),
      makeChannelEvent({
        author: {
          id: "agent_gamma",
          type: "agent"
        },
        causalChainId: "chain_ping_pong",
        id: "event_gamma_1"
      }),
      makeChannelEvent({
        author: {
          id: "agent_beta",
          type: "agent"
        },
        causalChainId: "chain_ping_pong",
        id: "event_beta_2"
      })
    ];

    expect(
      evaluateAgentActorLoopGuard({
        candidate,
        causalChainEvents: chainEvents,
        now,
        participant: makeParticipant({
          agentId: "agent_beta",
          id: "participant_beta",
          role: "custom_beta",
          triggerPolicy: {
            maxSamePairPingPong: 3
          }
        })
      })
    ).toEqual({
      action: "skip",
      skipReason: "same_pair_ping_pong"
    });
  });

  it("loop guard asks for a human checkpoint after too many consecutive agent turns", () => {
    const event = makeChannelEvent({
      author: {
        id: "agent_gamma",
        type: "agent"
      },
      causalChainId: "chain_no_human"
    });
    const candidate = {
      agentId: "agent_beta",
      causalChainId: "chain_no_human",
      channelId: event.channelId,
      priority: 80,
      reason: "agent_mention" as const,
      sourceAgentId: "agent_gamma",
      triggeringEventId: event.id,
      workspaceId: event.workspaceId
    };
    const chainEvents = [
      makeChannelEvent({
        author: {
          id: "agent_alpha",
          type: "agent"
        },
        causalChainId: "chain_no_human",
        id: "event_agent_1"
      }),
      makeChannelEvent({
        author: {
          id: "agent_beta",
          type: "agent"
        },
        causalChainId: "chain_no_human",
        id: "event_agent_2"
      })
    ];

    expect(
      evaluateAgentActorLoopGuard({
        candidate,
        causalChainEvents: chainEvents,
        now,
        participant: makeParticipant({
          agentId: "agent_beta",
          id: "participant_beta",
          role: "custom_beta",
          triggerPolicy: {
            maxConsecutiveTurnsWithoutHuman: 2
          }
        })
      })
    ).toEqual({
      action: "skip",
      skipReason: "no_human_checkpoint"
    });
  });

  it("loop guard enforces per-agent cooldown", () => {
    const event = makeChannelEvent();
    const candidate = {
      agentId: "agent_beta",
      causalChainId: event.id,
      channelId: event.channelId,
      priority: 100,
      reason: "human_mention" as const,
      sourceAgentId: null,
      triggeringEventId: event.id,
      workspaceId: event.workspaceId
    };

    expect(
      evaluateAgentActorLoopGuard({
        candidate,
        causalChainEvents: [event],
        now,
        participant: makeParticipant({
          agentId: "agent_beta",
          id: "participant_beta",
          role: "custom_beta",
          triggerPolicy: {
            cooldownMs: 30 * 1000
          }
        }),
        recentWakeRuns: [
          makeWakeRun({
            agentId: "agent_beta",
            startedAt: "2026-05-30T23:59:45.000Z"
          })
        ]
      })
    ).toEqual({
      action: "skip",
      skipReason: "cooldown"
    });
  });

  it("only lets user messages and manual wakes interrupt sleeping sessions", () => {
    const sleepingSession = makeSession({
      status: "sleeping"
    });

    expect(
      selectAgentActorWakeDecision({
        mailboxEvents: [makeEvent({ kind: "handoff_artifact" })],
        now,
        session: sleepingSession
      })
    ).toMatchObject({
      action: "skip",
      skipReason: "sleeping"
    });

    expect(
      selectAgentActorWakeDecision({
        mailboxEvents: [makeEvent({ id: "event_manual", kind: "manual_wake" })],
        now,
        session: sleepingSession
      })
    ).toMatchObject({
      action: "wake",
      reason: "manual_wake"
    });
  });

  it("does not wake stopped sessions even if queued work exists", () => {
    expect(
      selectAgentActorWakeDecision({
        mailboxEvents: [makeEvent({ kind: "user_message" })],
        now,
        session: makeSession({ status: "stopped" })
      })
    ).toMatchObject({
      action: "skip",
      skipReason: "stopped"
    });
  });

  it("skips heartbeat ticks while the same actor is already busy", () => {
    const decision = selectAgentActorWakeDecision({
      mailboxEvents: [makeEvent({ kind: "heartbeat_tick" })],
      now,
      session: makeSession({
        status: "running"
      })
    });

    expect(decision).toMatchObject({
      action: "skip",
      selectedEventIds: ["event_1"],
      skipReason: "busy"
    });
  });

  it("wakes heartbeat when the actor is idle and the interval has elapsed", () => {
    const decision = selectAgentActorWakeDecision({
      mailboxEvents: [makeEvent({ id: "event_heartbeat", kind: "heartbeat_tick" })],
      now,
      session: makeSession({
        lastHeartbeatAt: thirtyOneMinutesAgo
      })
    });

    expect(decision).toMatchObject({
      action: "wake",
      reason: "heartbeat_due",
      selectedEventIds: ["event_heartbeat"],
      shouldCallModel: true,
      shouldEmitMessage: false
    });
  });

  it("can wake heartbeat from session cadence even before a tick event is persisted", () => {
    const decision = selectAgentActorWakeDecision({
      mailboxEvents: [],
      now,
      session: makeSession({
        lastHeartbeatAt: thirtyOneMinutesAgo
      })
    });

    expect(decision).toMatchObject({
      action: "wake",
      reason: "heartbeat_due",
      selectedEventIds: []
    });
  });

  it("skips heartbeat inside the quiet window after an interactive wake", () => {
    const decision = selectAgentActorWakeDecision({
      mailboxEvents: [makeEvent({ kind: "heartbeat_tick" })],
      now,
      session: makeSession({
        lastWakeAt: oneMinuteAgo,
        heartbeatPolicy: {
          quietWindowMs: 2 * 60 * 1000
        }
      })
    });

    expect(decision).toMatchObject({
      action: "skip",
      skipReason: "quiet_window"
    });
  });

  it("skips heartbeat outside configured active hours", () => {
    const decision = selectAgentActorWakeDecision({
      mailboxEvents: [makeEvent({ kind: "heartbeat_tick" })],
      now: "2026-05-31T18:00:00.000Z",
      session: makeSession({
        heartbeatPolicy: {
          activeHours: {
            end: "17:00",
            start: "09:00",
            timezone: "UTC"
          }
        },
        lastHeartbeatAt: thirtyOneMinutesAgo
      })
    });

    expect(decision).toMatchObject({
      action: "skip",
      skipReason: "outside_active_hours"
    });
  });

  it("allows heartbeat inside active hours that wrap across midnight", () => {
    const decision = selectAgentActorWakeDecision({
      mailboxEvents: [makeEvent({ kind: "heartbeat_tick" })],
      now: "2026-05-31T23:00:00.000Z",
      session: makeSession({
        heartbeatPolicy: {
          activeHours: {
            end: "02:00",
            start: "22:00",
            timezone: "UTC"
          }
        },
        lastHeartbeatAt: thirtyOneMinutesAgo
      })
    });

    expect(decision).toMatchObject({
      action: "wake",
      reason: "heartbeat_due"
    });
  });

  it("falls back to UTC when active hours contain an invalid timezone", () => {
    const decision = selectAgentActorWakeDecision({
      mailboxEvents: [makeEvent({ kind: "heartbeat_tick" })],
      now: "2026-05-31T18:00:00.000Z",
      session: makeSession({
        heartbeatPolicy: {
          activeHours: {
            end: "17:00",
            start: "09:00",
            timezone: "Invalid/Zone"
          }
        },
        lastHeartbeatAt: thirtyOneMinutesAgo
      })
    });

    expect(decision).toMatchObject({
      action: "skip",
      skipReason: "outside_active_hours"
    });
  });

  it("skips heartbeat when the interval has not elapsed", () => {
    const decision = selectAgentActorWakeDecision({
      mailboxEvents: [makeEvent({ kind: "heartbeat_tick" })],
      now,
      session: makeSession({
        lastHeartbeatAt: oneMinuteAgo
      })
    });

    expect(decision).toMatchObject({
      action: "skip",
      skipReason: "not_due"
    });
  });

  it("caps heartbeat model calls by hourly wake budget", () => {
    const recentWakeRuns = [
      makeWakeRun({ id: "wake_1", startedAt: "2026-05-30T23:10:00.000Z" }),
      makeWakeRun({ id: "wake_2", startedAt: "2026-05-30T23:20:00.000Z" })
    ];
    const decision = selectAgentActorWakeDecision({
      mailboxEvents: [makeEvent({ kind: "heartbeat_tick" })],
      now,
      recentWakeRuns,
      session: makeSession({
        heartbeatPolicy: {
          maxWakeRunsPerHour: 2
        },
        lastHeartbeatAt: thirtyOneMinutesAgo
      })
    });

    expect(decision).toMatchObject({
      action: "skip",
      skipReason: "budget_exhausted"
    });
  });

  it("counts completed heartbeat runs toward the hourly wake budget", () => {
    const decision = selectAgentActorWakeDecision({
      mailboxEvents: [makeEvent({ kind: "heartbeat_tick" })],
      now,
      recentWakeRuns: [
        makeWakeRun({
          id: "wake_completed",
          startedAt: "2026-05-30T23:30:00.000Z",
          status: "completed"
        })
      ],
      session: makeSession({
        heartbeatPolicy: {
          maxWakeRunsPerHour: 1
        },
        lastHeartbeatAt: thirtyOneMinutesAgo
      })
    });

    expect(decision).toMatchObject({
      action: "skip",
      skipReason: "budget_exhausted"
    });
  });

  it("suppresses short HEARTBEAT_OK responses as invisible acknowledgements", () => {
    const response = interpretAgentActorHeartbeatResponse({
      content: "HEARTBEAT_OK",
      policy: makeSession().heartbeatPolicy
    });

    expect(response).toEqual({
      ackMatched: true,
      cleanedContent: "",
      shouldEmitMessage: false
    });
  });

  it("does not treat HEARTBEAT_OK in the middle of a message as an acknowledgement", () => {
    const response = interpretAgentActorHeartbeatResponse({
      content: "I found one issue. HEARTBEAT_OK Please review artifact_1.",
      policy: makeSession().heartbeatPolicy
    });

    expect(response).toEqual({
      ackMatched: false,
      cleanedContent: "I found one issue. HEARTBEAT_OK Please review artifact_1.",
      shouldEmitMessage: true
    });
  });

  it("keeps long heartbeat responses visible even when they start with HEARTBEAT_OK", () => {
    const response = interpretAgentActorHeartbeatResponse({
      content: `HEARTBEAT_OK ${"x".repeat(301)}`,
      policy: makeSession().heartbeatPolicy
    });

    expect(response.ackMatched).toBe(false);
    expect(response.shouldEmitMessage).toBe(true);
  });

  it("creates heartbeat tick events with the heartbeat-only prompt contract", () => {
    const event = createAgentActorHeartbeatTickEvent({
      agentId: "agent_1",
      conversationId: "conv_1",
      id: "event_heartbeat",
      now,
      sessionId: "actor_session_1",
      workspaceId: "workspace_1"
    });

    expect(event).toMatchObject({
      kind: "heartbeat_tick",
      payload: {
        promptContract: "HEARTBEAT_OK_ALLOWED"
      },
      priority: 10,
      status: "queued"
    });
  });

  it("creates wake run receipts from decisions", () => {
    const session = makeSession();
    const decision = selectAgentActorWakeDecision({
      mailboxEvents: [makeEvent({ id: "event_handoff", kind: "handoff_artifact" })],
      now,
      session
    });
    const run = createAgentActorWakeRun({
      decision,
      id: "wake_run_1",
      now,
      session
    });

    expect(run).toMatchObject({
      id: "wake_run_1",
      messageEmitted: true,
      modelCalled: true,
      reason: "handoff_artifact",
      selectedEventIds: ["event_handoff"],
      status: "started"
    });
  });

  it("moves sessions through running, heartbeat observed, and idle states", () => {
    const runningSession = markAgentActorRunning({
      now,
      runId: "wake_run_1",
      session: makeSession()
    });
    const heartbeatSession = markAgentActorHeartbeatObserved({
      now: "2026-05-31T00:01:00.000Z",
      session: runningSession
    });
    const idleSession = markAgentActorIdle({
      now: "2026-05-31T00:02:00.000Z",
      session: heartbeatSession
    });

    expect(runningSession).toMatchObject({
      activeRunId: "wake_run_1",
      lastWakeAt: now,
      status: "running"
    });
    expect(heartbeatSession.lastHeartbeatAt).toBe("2026-05-31T00:01:00.000Z");
    expect(idleSession).toMatchObject({
      activeRunId: null,
      status: "idle",
      updatedAt: "2026-05-31T00:02:00.000Z"
    });
  });

  it("classifies only active processing statuses as busy", () => {
    expect(isAgentActorBusyStatus("waking")).toBe(true);
    expect(isAgentActorBusyStatus("running")).toBe(true);
    expect(isAgentActorBusyStatus("waiting")).toBe(true);
    expect(isAgentActorBusyStatus("blocked")).toBe(false);
    expect(isAgentActorBusyStatus("idle")).toBe(false);
  });
});

type AgentActorSessionOverrides = Omit<
  Partial<AgentActorSession>,
  "heartbeatPolicy"
> & {
  heartbeatPolicy?: Partial<AgentActorSession["heartbeatPolicy"]>;
};

function makeSession(overrides: AgentActorSessionOverrides = {}): AgentActorSession {
  return agentActorSessionSchema.parse({
    agentId: "agent_1",
    conversationId: "conv_1",
    createdAt: now,
    id: "actor_session_1",
    profileId: "profile_1",
    status: "idle",
    updatedAt: now,
    workspaceId: "workspace_1",
    ...overrides
  });
}

function makeEvent(
  overrides: Partial<AgentActorMailboxEvent> & {
    kind?: AgentActorMailboxEventKind;
  } = {}
): AgentActorMailboxEvent {
  return agentActorMailboxEventSchema.parse({
    agentId: "agent_1",
    availableAt: now,
    conversationId: "conv_1",
    createdAt: now,
    id: "event_1",
    kind: "user_message",
    sessionId: "actor_session_1",
    workspaceId: "workspace_1",
    ...overrides
  });
}

function makeChannelEvent(
  overrides: Partial<AgentActorChannelEvent> = {}
): AgentActorChannelEvent {
  return agentActorChannelEventSchema.parse({
    author: {
      id: "user_1",
      type: "human"
    },
    channelId: "channel_1",
    content: "hello @Beta",
    createdAt: now,
    id: "channel_event_1",
    mentions: [
      {
        rawText: "@Beta",
        targetId: "agent_beta",
        targetType: "agent"
      }
    ],
    type: "user_message",
    workspaceId: "workspace_1",
    ...overrides
  });
}

type AgentActorParticipantOverrides = Omit<
  Partial<AgentActorParticipant>,
  "triggerPolicy"
> & {
  triggerPolicy?: Partial<AgentActorParticipant["triggerPolicy"]>;
};

function makeParticipant(
  overrides: AgentActorParticipantOverrides = {}
): AgentActorParticipant {
  return agentActorParticipantSchema.parse({
    agentId: "agent_beta",
    behaviorRef: "agent-behavior:beta:v1",
    channelId: "channel_1",
    displayName: "自定义同事 Beta",
    id: "participant_beta",
    memoryScope: "private",
    role: "custom_beta",
    roleTags: ["user-defined-beta"],
    templateId: "template:user-owned",
    toolPolicyId: "tool-policy:beta",
    workspaceId: "workspace_1",
    ...overrides
  });
}

function makeWakeRun(overrides: Partial<AgentActorWakeRun> = {}): AgentActorWakeRun {
  return agentActorWakeRunSchema.parse({
    agentId: "agent_1",
    decision: {
      action: "wake",
      reason: "heartbeat_due",
      shouldCallModel: true,
      shouldEmitMessage: false
    },
    id: "wake_run",
    modelCalled: true,
    reason: "heartbeat_due",
    sessionId: "actor_session_1",
    startedAt: now,
    status: "started",
    workspaceId: "workspace_1",
    ...overrides
  });
}
