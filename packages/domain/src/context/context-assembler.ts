import type { Message } from "@agenthub/contracts";

export type PinnedContextMessage = Pick<Message, "content" | "id" | "role">;
export type RecentContextMessage = Pick<Message, "content" | "id" | "role">;

export type ConversationContext = {
  pinnedMessages: PinnedContextMessage[];
  recentMessages: RecentContextMessage[];
};

export function assemblePinnedContext(
  messages: ReadonlyArray<Message>
): ConversationContext {
  return {
    pinnedMessages: normalizeContextMessages(
      [...messages]
        .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime())
        .filter((message) => message.isPinned)
    ),
    recentMessages: []
  };
}

export function assembleConversationContext(input: {
  maxChars?: number;
  pinnedMessages: ReadonlyArray<Message>;
  recentMessages: ReadonlyArray<Message>;
}): ConversationContext {
  const pinnedMessages = normalizeContextMessages(
    [...input.pinnedMessages]
      .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime())
      .filter((message) => message.isPinned)
  );
  const pinnedIds = new Set(pinnedMessages.map((message) => message.id));
  const recentMessages = normalizeContextMessages(
    [...input.recentMessages]
      .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime())
      .filter((message) => !pinnedIds.has(message.id))
  );

  return compactConversationContext({
    maxChars: input.maxChars,
    pinnedMessages,
    recentMessages
  });
}

function normalizeContextMessages(
  messages: ReadonlyArray<Message>
): PinnedContextMessage[] {
  return messages.map((message) => ({
    content: message.content,
    id: message.id,
    role: message.role
  }));
}

function compactConversationContext(input: {
  maxChars?: number;
  pinnedMessages: PinnedContextMessage[];
  recentMessages: RecentContextMessage[];
}): ConversationContext {
  const maxChars = input.maxChars;

  if (!maxChars || maxChars <= 0) {
    return {
      pinnedMessages: input.pinnedMessages,
      recentMessages: input.recentMessages
    };
  }

  const pinnedChars = input.pinnedMessages.reduce(
    (total, message) => total + message.content.length,
    0
  );
  const remainingChars = Math.max(0, maxChars - pinnedChars);
  const compactRecent: RecentContextMessage[] = [];
  let usedChars = 0;

  for (const message of [...input.recentMessages].reverse()) {
    const nextChars = usedChars + message.content.length;

    if (nextChars > remainingChars) {
      continue;
    }

    compactRecent.push(message);
    usedChars = nextChars;
  }

  return {
    pinnedMessages: input.pinnedMessages,
    recentMessages: compactRecent.reverse()
  };
}
