"use client";

import { useEffect, useState } from "react";

import { streamEventSchema, type StreamEvent } from "@agenthub/contracts";

type UseConversationStreamInput = {
  baseUrl?: string;
  conversationId?: string | null;
  enabled?: boolean;
  workspaceId?: string;
};

type ConversationStreamState = {
  connectionState: "connecting" | "error" | "idle" | "open";
  errorMessage: string | null;
  events: StreamEvent[];
  lastEvent: StreamEvent | null;
};

const defaultState: ConversationStreamState = {
  connectionState: "idle",
  errorMessage: null,
  events: [],
  lastEvent: null
};

export function useConversationStream(
  input: UseConversationStreamInput
): ConversationStreamState {
  const [state, setState] = useState<ConversationStreamState>(defaultState);

  useEffect(() => {
    if (!input.enabled && input.enabled !== undefined) {
      setState(defaultState);
      return;
    }

    if (!input.conversationId) {
      setState(defaultState);
      return;
    }

    const workspaceId = input.workspaceId ?? "default-workspace";
    const url = new URL(
      `/streams/${input.conversationId}`,
      input.baseUrl ?? "http://localhost:3001"
    );

    url.searchParams.set("workspaceId", workspaceId);

    const eventSource = new EventSource(url.toString(), {
      withCredentials: true
    });

    setState({
      connectionState: "connecting",
      errorMessage: null,
      events: [],
      lastEvent: null
    });

    eventSource.onopen = () => {
      setState((current) => ({
        ...current,
        connectionState: "open",
        errorMessage: null
      }));
    };

    eventSource.onmessage = (event) => {
      try {
        const parsedEvent = streamEventSchema.parse(JSON.parse(event.data));

        setState((current) => ({
          connectionState: current.connectionState,
          errorMessage: null,
          events: [...current.events, parsedEvent],
          lastEvent: parsedEvent
        }));
      } catch {
        setState((current) => ({
          ...current,
          connectionState: "error",
          errorMessage: "Received an invalid stream event payload."
        }));
      }
    };

    eventSource.onerror = () => {
      setState((current) => ({
        ...current,
        connectionState: "connecting",
        errorMessage: null
      }));
    };

    return () => {
      eventSource.close();
    };
  }, [input.baseUrl, input.conversationId, input.enabled, input.workspaceId]);

  return state;
}
