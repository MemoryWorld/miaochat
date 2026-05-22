import type { AgentPinnedMessage } from "@agenthub/agent-sdk";

export type CredentialResolution = {
  providerAccountId: string;
  secret: string;
};

export type CredentialResolver = (input: {
  credentialId: string;
  workspaceId: string;
}) => Promise<CredentialResolution>;

export type StreamingFetchImplementation = typeof fetch;

export type StreamingClientOptions = {
  baseUrl?: string;
  credentialResolver: CredentialResolver;
  fetchImpl?: StreamingFetchImplementation;
};

export function buildPromptMessages(
  message: string,
  pinnedMessages: AgentPinnedMessage[] = []
): Array<{ content: string; role: "assistant" | "system" | "user" }> {
  const promptMessages: Array<{
    content: string;
    role: "assistant" | "system" | "user";
  }> = [];

  for (const pinned of pinnedMessages) {
    promptMessages.push({ content: pinned.content, role: pinned.role });
  }

  promptMessages.push({ content: message, role: "user" });
  return promptMessages;
}

export async function* readResponseLines(
  body: ReadableStream<Uint8Array> | null,
  options: { keepEmptyLines?: boolean } = {}
): AsyncGenerator<string, void, void> {
  if (!body) {
    return;
  }

  const reader = body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  const keepEmptyLines = options.keepEmptyLines ?? false;

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      buffer += decoder.decode();
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    let newlineIndex;
    while ((newlineIndex = buffer.indexOf("\n")) >= 0) {
      const rawLine = buffer.slice(0, newlineIndex);
      buffer = buffer.slice(newlineIndex + 1);
      const trimmed = rawLine.replace(/\r$/, "");
      if (keepEmptyLines || trimmed.length > 0) {
        yield trimmed;
      }
    }
  }

  if (buffer.length > 0) {
    yield buffer;
  }
}

export type ServerSentEvent = {
  data: string;
  event?: string;
};

export async function* readServerSentEvents(
  body: ReadableStream<Uint8Array> | null
): AsyncGenerator<ServerSentEvent, void, void> {
  let currentEvent: string | undefined;
  let currentData: string[] = [];

  for await (const line of readResponseLines(body, { keepEmptyLines: true })) {
    if (line === "") {
      if (currentData.length > 0) {
        yield {
          data: currentData.join("\n"),
          event: currentEvent
        };
      }
      currentEvent = undefined;
      currentData = [];
      continue;
    }

    if (line.startsWith(":")) {
      continue;
    }

    if (line.startsWith("event:")) {
      currentEvent = line.slice("event:".length).trim();
    } else if (line.startsWith("data:")) {
      currentData.push(line.slice("data:".length).trim());
    }
  }

  if (currentData.length > 0) {
    yield {
      data: currentData.join("\n"),
      event: currentEvent
    };
  }
}

export function jsonRequestInit(input: {
  body: unknown;
  headers?: Record<string, string>;
}): RequestInit {
  return {
    body: JSON.stringify(input.body),
    headers: {
      "Content-Type": "application/json",
      ...input.headers
    },
    method: "POST"
  };
}
