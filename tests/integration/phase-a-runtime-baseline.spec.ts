import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { StreamEvent } from "@agenthub/contracts";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import type { Worker } from "@temporalio/worker";
import { Client } from "pg";

import { createApp } from "../../apps/api/src/main.js";
import { bootstrapWorker } from "../../apps/worker/src/main.js";
import { signupSessionViaFetch } from "../support/auth-session.js";

const decoder = new TextDecoder();
const workspaceId = "workspace_phase_a_runtime";
const workerTaskQueue = "worker-task-phase-a-runtime";
const agentIds = {
  hermes: "agent_phase_a_hermes",
  openclaw: "agent_phase_a_openclaw"
};

type LoggedRequest = {
  body: string;
  headers: Record<string, string | string[] | undefined>;
  url: string;
};

describe("Phase A runtime baseline integration", () => {
  let app: NestFastifyApplication;
  let authCookie: string;
  let baseUrl: string;
  let client: Client;
  const hermesRequests: LoggedRequest[] = [];
  let hermesServer: Server;
  const openClawRequests: LoggedRequest[] = [];
  let openClawServer: Server;
  let ownerUserId: string;
  let previousHermesBaseUrl: string | undefined;
  let previousOpenClawBaseUrl: string | undefined;
  let previousWorkerTaskQueue: string | undefined;
  let worker: Worker;

  beforeAll(async () => {
    previousWorkerTaskQueue = process.env.WORKER_TASK_QUEUE;
    previousHermesBaseUrl = process.env.HERMES_BASE_URL;
    previousOpenClawBaseUrl = process.env.OPENCLAW_BASE_URL;
    process.env.WORKER_TASK_QUEUE = workerTaskQueue;

    hermesServer = createServer((request, response) => {
      captureRequest(request, async (body) => {
        hermesRequests.push({
          body,
          headers: request.headers,
          url: request.url ?? ""
        });

        response.writeHead(200, {
          "content-type": "application/x-ndjson"
        });
        response.write(`${JSON.stringify({ type: "started" })}\n`);
        response.write(`${JSON.stringify({ text: "Hermes says ", type: "delta" })}\n`);
        response.write(
          `${JSON.stringify({ finalContent: "Hermes says ready", type: "completed" })}\n`
        );
        response.end();
      });
    });

    openClawServer = createServer((request, response) => {
      captureRequest(request, async (body) => {
        openClawRequests.push({
          body,
          headers: request.headers,
          url: request.url ?? ""
        });

        response.writeHead(200, {
          "content-type": "text/event-stream"
        });
        response.write(
          `data: ${JSON.stringify({ chunk: "OpenClaw says ", type: "chunk" })}\n\n`
        );
        response.write(
          `data: ${JSON.stringify({
            finalContent: "OpenClaw says ready",
            type: "completed"
          })}\n\n`
        );
        response.end("data: [DONE]\n\n");
      });
    });

    await Promise.all([
      new Promise<void>((resolve) => {
        hermesServer.listen(0, "127.0.0.1", resolve);
      }),
      new Promise<void>((resolve) => {
        openClawServer.listen(0, "127.0.0.1", resolve);
      })
    ]);

    process.env.HERMES_BASE_URL = `http://127.0.0.1:${(hermesServer.address() as AddressInfo).port}`;
    process.env.OPENCLAW_BASE_URL = `http://127.0.0.1:${(openClawServer.address() as AddressInfo).port}`;

    client = new Client({
      connectionString:
        process.env.DATABASE_URL ?? "postgres://agenthub:agenthub@localhost:5432/agenthub"
    });
    await client.connect();
    await clearWorkspace(client);
    await clearAgents(client);
    await clearCredentials(client);

    app = await createApp();
    await app.listen({
      host: "127.0.0.1",
      port: 0
    });
    baseUrl = await app.getUrl();
    const session = await signupSessionViaFetch(baseUrl, {
      displayName: "Phase A Runtime Integration",
      email: `phase-a-runtime-${Date.now()}@example.com`
    });
    authCookie = session.cookie;
    ownerUserId = session.user.id;

    await seedAgents(client, ownerUserId);
    worker = await bootstrapWorker();
  }, 20_000);

  afterAll(async () => {
    if (app) {
      await app.close();
    }

    await clearWorkspace(client);
    await clearAgents(client);
    await clearCredentials(client);
    await client.end();

    await Promise.all([
      new Promise<void>((resolve, reject) => {
        hermesServer.close((error) => (error ? reject(error) : resolve()));
      }),
      new Promise<void>((resolve, reject) => {
        openClawServer.close((error) => (error ? reject(error) : resolve()));
      })
    ]);

    process.env.WORKER_TASK_QUEUE = previousWorkerTaskQueue;
    restoreEnv("HERMES_BASE_URL", previousHermesBaseUrl);
    restoreEnv("OPENCLAW_BASE_URL", previousOpenClawBaseUrl);
  }, 20_000);

  it("binds BYOK credentials and uses Hermes/OpenClaw through the real runtime path", async () => {
    await bindCredential({
      authCookie,
      baseUrl,
      label: "Hermes Runtime",
      provider: "hermes",
      providerAccountId: "acct_phase_a_hermes",
      rawSecret: "hermes_secret_phase_a",
      workspaceId
    });
    await bindCredential({
      authCookie,
      baseUrl,
      label: "OpenClaw Runtime",
      provider: "openclaw",
      providerAccountId: "acct_phase_a_openclaw",
      rawSecret: "openclaw_secret_phase_a",
      workspaceId
    });

    await worker.runUntil(async () => {
      const hermesConversationId = await createConversation({
        agentIds: [agentIds.hermes],
        authCookie,
        baseUrl,
        mode: "direct",
        workspaceId
      });
      const pinnedMessageId = await createMessage({
        authCookie,
        baseUrl,
        content: "Remember the baseline note",
        conversationId: hermesConversationId,
        workspaceId
      });
      await pinMessage({
        authCookie,
        baseUrl,
        messageId: pinnedMessageId,
        workspaceId
      });

      const hermesStream = await openStream({
        authCookie,
        baseUrl,
        conversationId: hermesConversationId,
        workspaceId
      });
      await sendMessage({
        authCookie,
        baseUrl,
        content: "Use the pinned note",
        conversationId: hermesConversationId,
        workspaceId
      });
      const hermesEvents = await readEvents(hermesStream.reader, 3);
      const hermesMessages = await waitForMessages(baseUrl, hermesConversationId, 3, authCookie);

      expect(hermesEvents.map((event) => event.kind)).toEqual([
        "conversation.message.started",
        "conversation.message.delta",
        "conversation.message.completed"
      ]);
      expect(hermesMessages[2]?.content).toBe("Hermes says ready");
      expect(hermesMessages[2]?.sourceAgentId).toBe(agentIds.hermes);
      expect(JSON.parse(hermesRequests.at(-1)?.body ?? "{}")).toEqual(
        expect.objectContaining({
          prompt: "Use the pinned note",
          pinnedMessages: [
            expect.objectContaining({
              content: "Remember the baseline note",
              role: "user"
            })
          ]
        })
      );

      await hermesStream.reader.cancel();

      const openClawConversationId = await createConversation({
        agentIds: [agentIds.openclaw],
        authCookie,
        baseUrl,
        mode: "direct",
        workspaceId
      });
      const openClawStream = await openStream({
        authCookie,
        baseUrl,
        conversationId: openClawConversationId,
        workspaceId
      });
      await sendMessage({
        authCookie,
        baseUrl,
        content: "Ship the runtime slice",
        conversationId: openClawConversationId,
        workspaceId
      });
      const openClawEvents = await readEvents(openClawStream.reader, 3);
      const openClawMessages = await waitForMessages(
        baseUrl,
        openClawConversationId,
        2,
        authCookie
      );

      expect(openClawEvents.map((event) => event.kind)).toEqual([
        "conversation.message.started",
        "conversation.message.delta",
        "conversation.message.completed"
      ]);
      expect(openClawMessages[1]?.content).toBe("OpenClaw says ready");
      expect(openClawMessages[1]?.sourceAgentId).toBe(agentIds.openclaw);
      expect(JSON.parse(openClawRequests.at(-1)?.body ?? "{}")).toEqual(
        expect.objectContaining({
          messages: [
            expect.objectContaining({
              content: "Ship the runtime slice",
              role: "user"
            })
          ],
          stream: true
        })
      );

      await openClawStream.reader.cancel();

      const groupConversationId = await createConversation({
        agentIds: [agentIds.hermes, agentIds.openclaw],
        authCookie,
        baseUrl,
        mode: "group",
        workspaceId
      });
      const groupStream = await openStream({
        authCookie,
        baseUrl,
        conversationId: groupConversationId,
        workspaceId
      });
      await sendMessage({
        authCookie,
        baseUrl,
        content: "Coordinate the baseline",
        conversationId: groupConversationId,
        workspaceId
      });
      const groupEvents = await readEvents(groupStream.reader, 7);
      const groupMessages = await waitForMessages(baseUrl, groupConversationId, 2, authCookie);

      expect(
        groupEvents
          .filter((event) => event.kind === "conversation.status")
          .map((event) => event.payload.label)
      ).toEqual([
        "orchestrator.received",
        "orchestrator.dispatched",
        "orchestrator.running",
        "orchestrator.aggregated"
      ]);
      expect(groupMessages[1]?.content).toContain("[Hermes Planner]");
      expect(groupMessages[1]?.content).toContain("Hermes says ready");
      expect(groupMessages[1]?.content).toContain("[OpenClaw Builder]");
      expect(groupMessages[1]?.content).toContain("OpenClaw says ready");
      expect(groupMessages[1]?.sourceAgentId).toBeNull();

      await groupStream.reader.cancel();
      worker.shutdown();
    });
  }, 20_000);
});

async function bindCredential(input: {
  authCookie: string;
  baseUrl: string;
  label: string;
  provider: "hermes" | "openclaw";
  providerAccountId: string;
  rawSecret: string;
  workspaceId: string;
}) {
  const validateResponse = await fetch(`${input.baseUrl}/credentials/validate`, {
    body: JSON.stringify({
      label: input.label,
      provider: input.provider,
      providerAccountId: input.providerAccountId,
      rawSecret: input.rawSecret,
      workspaceId: input.workspaceId
    }),
    headers: {
      "Content-Type": "application/json",
      cookie: input.authCookie
    },
    method: "POST"
  });

  expect(validateResponse.status).toBe(200);
  expect(await validateResponse.json()).toEqual(
    expect.objectContaining({
      providerAccountId: input.providerAccountId,
      valid: true
    })
  );

  const createResponse = await fetch(`${input.baseUrl}/credentials`, {
    body: JSON.stringify({
      label: input.label,
      provider: input.provider,
      providerAccountId: input.providerAccountId,
      rawSecret: input.rawSecret,
      workspaceId: input.workspaceId
    }),
    headers: {
      "Content-Type": "application/json",
      cookie: input.authCookie
    },
    method: "POST"
  });

  expect(createResponse.status).toBe(201);
  expect(await createResponse.json()).toEqual(
    expect.objectContaining({
      provider: input.provider,
      providerAccountId: input.providerAccountId,
      validationState: "valid"
    })
  );
}

async function createConversation(input: {
  agentIds: string[];
  authCookie: string;
  baseUrl: string;
  mode: "direct" | "group";
  workspaceId: string;
}) {
  const response = await fetch(`${input.baseUrl}/conversations`, {
    body: JSON.stringify({
      agentIds: input.agentIds,
      mode: input.mode,
      workspaceId: input.workspaceId
    }),
    headers: {
      "Content-Type": "application/json",
      cookie: input.authCookie
    },
    method: "POST"
  });

  expect(response.status).toBe(201);
  return (await response.json()).id as string;
}

async function createMessage(input: {
  authCookie: string;
  baseUrl: string;
  content: string;
  conversationId: string;
  workspaceId: string;
}) {
  const response = await fetch(`${input.baseUrl}/messages`, {
    body: JSON.stringify({
      content: input.content,
      conversationId: input.conversationId,
      role: "user",
      workspaceId: input.workspaceId
    }),
    headers: {
      "Content-Type": "application/json",
      cookie: input.authCookie
    },
    method: "POST"
  });

  expect(response.status).toBe(201);
  return ((await response.json()) as { id: string }).id;
}

async function pinMessage(input: {
  authCookie: string;
  baseUrl: string;
  messageId: string;
  workspaceId: string;
}) {
  const response = await fetch(
    `${input.baseUrl}/messages/${input.messageId}/pin?workspaceId=${input.workspaceId}`,
    {
      headers: {
        cookie: input.authCookie
      },
      method: "POST"
    }
  );

  expect(response.status).toBe(200);
}

async function openStream(input: {
  authCookie: string;
  baseUrl: string;
  conversationId: string;
  workspaceId: string;
}) {
  const response = await fetch(
    `${input.baseUrl}/streams/${input.conversationId}?workspaceId=${input.workspaceId}`,
    {
      headers: {
        Accept: "text/event-stream",
        cookie: input.authCookie
      }
    }
  );

  expect(response.status).toBe(200);
  const reader = response.body?.getReader();
  expect(reader).toBeDefined();
  expect(await readChunk(reader!)).toContain(": connected");

  return { reader: reader! };
}

async function sendMessage(input: {
  authCookie: string;
  baseUrl: string;
  content: string;
  conversationId: string;
  workspaceId: string;
}) {
  const response = await fetch(`${input.baseUrl}/messages/send`, {
    body: JSON.stringify({
      content: input.content,
      conversationId: input.conversationId,
      role: "user",
      workspaceId: input.workspaceId
    }),
    headers: {
      "Content-Type": "application/json",
      cookie: input.authCookie
    },
    method: "POST"
  });

  expect(response.status).toBe(202);
}

async function seedAgents(client: Client, ownerUserId: string): Promise<void> {
  await client.query(
    `
      INSERT INTO custom_agents (
        id,
        avatar_url,
        capability_tags,
        name,
        owner_user_id,
        provider,
        system_prompt,
        tool_bindings,
        workspace_id
      )
      VALUES
        ($1, null, '[]'::jsonb, 'Hermes Planner', $3, 'hermes', 'Plan', '[]'::jsonb, $4),
        ($2, null, '[]'::jsonb, 'OpenClaw Builder', $3, 'openclaw', 'Build', '[]'::jsonb, $4)
      ON CONFLICT DO NOTHING
    `,
    [agentIds.hermes, agentIds.openclaw, ownerUserId, workspaceId]
  );
}

async function clearWorkspace(client: Client): Promise<void> {
  await client.query("DELETE FROM conversations WHERE workspace_id = $1", [workspaceId]);
}

async function clearAgents(client: Client): Promise<void> {
  await client.query("DELETE FROM custom_agents WHERE workspace_id = $1", [workspaceId]);
}

async function clearCredentials(client: Client): Promise<void> {
  await client.query("DELETE FROM provider_credentials WHERE workspace_id = $1", [workspaceId]);
}

async function captureRequest(
  request: Parameters<typeof createServer>[0] extends (
    ...args: infer T
  ) => unknown
    ? T[0]
    : never,
  onEnd: (body: string) => Promise<void> | void
) {
  let body = "";
  request.on("data", (chunk) => {
    body += chunk.toString("utf8");
  });
  request.on("end", () => {
    void onEnd(body);
  });
}

async function readChunk(
  reader: ReadableStreamDefaultReader<Uint8Array>
): Promise<string> {
  const result = await reader.read();

  if (result.done || !result.value) {
    throw new Error("Expected SSE chunk but stream closed.");
  }

  return decoder.decode(result.value);
}

async function readEvents(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  expectedCount: number
): Promise<StreamEvent[]> {
  const events: StreamEvent[] = [];

  while (events.length < expectedCount) {
    const chunk = await readChunk(reader);
    const dataLines = chunk
      .split("\n")
      .filter((line) => line.startsWith("data: "));

    for (const line of dataLines) {
      events.push(JSON.parse(line.slice("data: ".length)) as StreamEvent);
    }
  }

  return events;
}

async function waitForMessages(
  baseUrl: string,
  conversationId: string,
  expectedCount: number,
  authCookie: string
): Promise<
  Array<{
    content: string;
    role: string;
    sourceAgentId: string | null;
  }>
> {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const response = await fetch(
      `${baseUrl}/messages?conversationId=${conversationId}&workspaceId=${workspaceId}`,
      {
        headers: {
          cookie: authCookie
        }
      }
    );
    const payload = (await response.json()) as Array<{
      content: string;
      role: string;
      sourceAgentId: string | null;
    }>;

    if (payload.length >= expectedCount) {
      return payload;
    }

    await new Promise((resolve) => {
      setTimeout(resolve, 50);
    });
  }

  throw new Error(`Timed out waiting for ${expectedCount} messages.`);
}

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
    return;
  }

  process.env[name] = value;
}
