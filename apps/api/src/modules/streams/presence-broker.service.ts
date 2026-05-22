import { Inject, Injectable } from "@nestjs/common";

import {
  type PresenceAction,
  type PresenceEvent,
  type PresenceSnapshot
} from "@agenthub/contracts";

import { WorkspaceAuditService } from "../workspaces/audit.service.js";
import { StreamBrokerService } from "./stream-broker.service.js";

type ParticipantState = {
  action: PresenceAction;
  lastReadMessageId: string | null;
  timestamp: Date;
  userId: string;
};

type ConversationKey = `${string}:${string}`;

@Injectable()
export class PresenceBrokerService {
  private readonly state = new Map<ConversationKey, Map<string, ParticipantState>>();
  private readonly listeners = new Map<ConversationKey, Set<(event: PresenceEvent) => void>>();

  constructor(
    @Inject(WorkspaceAuditService) private readonly audit: WorkspaceAuditService,
    @Inject(StreamBrokerService)
    private readonly streamBroker: StreamBrokerService
  ) {
    void this.streamBroker; // referenced so future SSE bridging is straightforward
  }

  publish(input: {
    action: PresenceAction;
    conversationId: string;
    lastReadMessageId?: string | null;
    userId: string;
    workspaceId: string;
  }): PresenceEvent {
    const key = createKey(input.workspaceId, input.conversationId);
    const participants = this.state.get(key) ?? new Map<string, ParticipantState>();
    const timestamp = new Date();

    const previous = participants.get(input.userId);
    const lastReadMessageId =
      input.lastReadMessageId !== undefined
        ? input.lastReadMessageId
        : previous?.lastReadMessageId ?? null;

    const nextState: ParticipantState = {
      action: input.action,
      lastReadMessageId,
      timestamp,
      userId: input.userId
    };

    if (input.action === "left") {
      participants.delete(input.userId);
    } else {
      participants.set(input.userId, nextState);
    }
    this.state.set(key, participants);

    const event: PresenceEvent = {
      kind: "conversation.presence",
      payload: {
        action: input.action,
        conversationId: input.conversationId,
        lastReadMessageId,
        timestamp,
        userId: input.userId,
        workspaceId: input.workspaceId
      }
    };

    const listeners = this.listeners.get(key);
    if (listeners) {
      for (const listener of listeners) {
        try {
          listener(event);
        } catch {
          // listeners are best-effort; swallow downstream errors so a single
          // bad subscriber cannot starve the rest of the room.
        }
      }
    }

    if (input.action === "read") {
      // Read-marker changes are interesting for the conversation access
      // review timeline, so they get logged. Other actions stay ephemeral.
      void this.audit
        .append({
          action: "conversation.share",
          actorUserId: input.userId,
          details: {
            action: "read",
            conversationId: input.conversationId,
            lastReadMessageId
          },
          resourceId: input.conversationId,
          resourceType: "conversation_read_marker",
          workspaceId: input.workspaceId,
          workspaceOwnerUserId: input.workspaceId === "default-workspace"
            ? input.userId
            : input.userId
        })
        .catch(() => {
          // Audit append failures must not block the live presence broadcast.
        });
    }

    return event;
  }

  snapshot(workspaceId: string, conversationId: string): PresenceSnapshot {
    const key = createKey(workspaceId, conversationId);
    const participants = this.state.get(key);

    return {
      conversationId,
      participants: participants
        ? Array.from(participants.values()).map((entry) => ({
            action: entry.action,
            lastReadMessageId: entry.lastReadMessageId,
            timestamp: entry.timestamp,
            userId: entry.userId
          }))
        : []
    };
  }

  subscribe(
    workspaceId: string,
    conversationId: string,
    listener: (event: PresenceEvent) => void
  ): () => void {
    const key = createKey(workspaceId, conversationId);
    const listeners = this.listeners.get(key) ?? new Set();
    listeners.add(listener);
    this.listeners.set(key, listeners);
    return () => {
      const active = this.listeners.get(key);
      if (!active) {
        return;
      }
      active.delete(listener);
      if (active.size === 0) {
        this.listeners.delete(key);
      }
    };
  }
}

function createKey(workspaceId: string, conversationId: string): ConversationKey {
  return `${workspaceId}:${conversationId}`;
}
