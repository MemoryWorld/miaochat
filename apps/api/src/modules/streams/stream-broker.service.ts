import { Injectable } from "@nestjs/common";

import { streamEventSchema, type StreamEvent } from "@agenthub/contracts";

type StreamListener = (event: StreamEvent) => void;

type PublishStreamEventInput = {
  conversationId: string;
  event: StreamEvent;
  workspaceId: string;
};

type StreamSubscriptionInput = {
  conversationId: string;
  workspaceId: string;
};

@Injectable()
export class StreamBrokerService {
  private readonly listeners = new Map<string, Set<StreamListener>>();

  publish(input: PublishStreamEventInput): void {
    const event = streamEventSchema.parse(input.event);
    const listeners = this.listeners.get(
      createStreamKey(input.conversationId, input.workspaceId)
    );

    if (!listeners) {
      return;
    }

    for (const listener of listeners) {
      listener(event);
    }
  }

  subscribe(
    input: StreamSubscriptionInput,
    listener: StreamListener
  ): () => void {
    const key = createStreamKey(input.conversationId, input.workspaceId);
    const listeners = this.listeners.get(key) ?? new Set<StreamListener>();

    listeners.add(listener);
    this.listeners.set(key, listeners);

    return () => {
      const activeListeners = this.listeners.get(key);

      if (!activeListeners) {
        return;
      }

      activeListeners.delete(listener);

      if (activeListeners.size === 0) {
        this.listeners.delete(key);
      }
    };
  }
}

function createStreamKey(conversationId: string, workspaceId: string): string {
  return `${workspaceId}:${conversationId}`;
}
