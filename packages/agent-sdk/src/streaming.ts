import type { StreamEvent } from "@agenthub/contracts";

export function createMessageLifecycleEvents(input: {
  finalContent: string;
  messageId: string;
}): StreamEvent[] {
  return [
    {
      kind: "conversation.message.started",
      payload: { messageId: input.messageId }
    },
    {
      kind: "conversation.message.delta",
      payload: { delta: input.finalContent, messageId: input.messageId }
    },
    {
      kind: "conversation.message.completed",
      payload: {
        finalContent: input.finalContent,
        messageId: input.messageId
      }
    }
  ];
}
