import type { Message } from "@agenthub/contracts";

export type PinnedContextMessage = Pick<Message, "content" | "id" | "role">;

export type ConversationContext = {
  pinnedMessages: PinnedContextMessage[];
};

export function assemblePinnedContext(
  messages: ReadonlyArray<Message>
): ConversationContext {
  return {
    pinnedMessages: [...messages]
      .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime())
      .filter((message) => message.isPinned)
      .map((message) => ({
        content: message.content,
        id: message.id,
        role: message.role
      }))
  };
}
