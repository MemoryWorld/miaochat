import type { Message } from "@agenthub/contracts";

const pendingAssistantMessagePrefix = "pending-assistant:";

export type LiveAssistantMessage = {
  content: string;
  id: string;
  userMessageId?: string;
};

export function createPendingAssistantMessage(userMessageId: string): LiveAssistantMessage {
  return {
    content: "",
    id: `${pendingAssistantMessagePrefix}${userMessageId}`,
    userMessageId
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

  const userMessageId = resolveLiveAssistantUserMessageId(current);

  if (!userMessageId) {
    return false;
  }

  const userMessageIndex = messages.findIndex((message) => message.id === userMessageId);

  return (
    userMessageIndex >= 0 &&
    messages.slice(userMessageIndex + 1).some((message) => message.role === "assistant")
  );
}

function resolveLiveAssistantUserMessageId(
  current: LiveAssistantMessage
): string | null {
  if (current.userMessageId) {
    return current.userMessageId;
  }

  if (!current.id.startsWith(pendingAssistantMessagePrefix)) {
    return null;
  }

  return current.id.slice(pendingAssistantMessagePrefix.length);
}
