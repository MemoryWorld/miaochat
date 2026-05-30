import type { Message } from "@agenthub/contracts";

const pendingAssistantMessagePrefix = "pending-assistant:";

export type LiveAssistantMessage = {
  content: string;
  id: string;
};

export function createPendingAssistantMessage(userMessageId: string): LiveAssistantMessage {
  return {
    content: "",
    id: `${pendingAssistantMessagePrefix}${userMessageId}`
  };
}

export function shouldClearLiveAssistantMessage(
  current: LiveAssistantMessage | null,
  messages: Message[]
): boolean {
  if (!current) {
    return false;
  }

  if (messages.some((message) => message.id === current.id)) {
    return true;
  }

  if (!current.id.startsWith(pendingAssistantMessagePrefix)) {
    return false;
  }

  const userMessageId = current.id.slice(pendingAssistantMessagePrefix.length);
  const userMessageIndex = messages.findIndex((message) => message.id === userMessageId);

  return (
    userMessageIndex >= 0 &&
    messages.slice(userMessageIndex + 1).some((message) => message.role === "assistant")
  );
}
