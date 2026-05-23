/*
 * OpenClaw local shim.
 *
 * Bridges the OpenClawAdapter's expected HTTP protocol
 *   POST /v1/chat/completions  -> SSE: data: {"type":"chunk","chunk":"..."} ... data: [DONE]
 * to the real `openclaw` CLI installed on the developer machine.
 *
 * The real CLI is non-streaming: it prints ANSI log lines to stdout followed by
 * a single JSON object of shape
 *   { "payloads": [{ "text": "<assistant reply>", "mediaUrl": null }], "meta": {...} }
 * We buffer stdout, extract `payloads[0].text`, and emit it as one SSE chunk
 * followed by `[DONE]`. Adapter-side code joins deltas if no `completed` event
 * is seen, so this shape satisfies the existing OpenClawAdapter contract.
 *
 * Configuration via env:
 *   OPENCLAW_SHIM_HOST    default "127.0.0.1"
 *   OPENCLAW_SHIM_PORT    default 19002
 *   OPENCLAW_SHIM_AGENT   default "planner"
 *   OPENCLAW_BIN          default "openclaw"
 *
 * No API keys are read or persisted by this file. The underlying CLI inherits
 * the parent shell environment.
 */

import { Buffer } from "node:buffer";
import { spawn } from "node:child_process";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse
} from "node:http";

const HOST = process.env.OPENCLAW_SHIM_HOST ?? "127.0.0.1";
const PORT = Number(process.env.OPENCLAW_SHIM_PORT ?? 19002);
const AGENT_ID = process.env.OPENCLAW_SHIM_AGENT ?? "main";
const CLI_BIN = process.env.OPENCLAW_BIN ?? "openclaw";

type ChatBody = {
  messages?: Array<{ content?: string; role?: string }>;
};

type OpenClawResultEnvelope = {
  payloads?: Array<{ text?: string }>;
};

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });
}

function extractMessage(rawBody: string): string {
  try {
    const parsed = JSON.parse(rawBody) as ChatBody;
    const messages = parsed.messages ?? [];
    for (let i = messages.length - 1; i >= 0; i--) {
      const message = messages[i];
      if (message?.role === "user" && typeof message.content === "string") {
        return message.content;
      }
    }
  } catch {
    // fall through to default
  }
  return "ping";
}

function sse(payload: unknown): string {
  const data = typeof payload === "string" ? payload : JSON.stringify(payload);
  return `data: ${data}\n\n`;
}

function stripAnsi(input: string): string {
  // eslint-disable-next-line no-control-regex
  return input.replace(/\x1b\[[0-9;]*m/g, "");
}

function extractFinalText(stdoutRaw: string): string {
  const cleaned = stripAnsi(stdoutRaw).trim();
  if (cleaned.length === 0) {
    return "";
  }

  // The openclaw CLI emits a single top-level JSON object on stdout when
  // invoked with `--json`. ANSI log lines, if any, normally land on stderr.
  // Try to JSON.parse the whole stdout first; if that fails (mixed content),
  // fall back to slicing from the first `{`.
  const candidates: string[] = [cleaned];
  const firstBrace = cleaned.indexOf("{");
  if (firstBrace > 0) {
    candidates.push(cleaned.slice(firstBrace));
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as OpenClawResultEnvelope;
      const texts = (parsed.payloads ?? [])
        .map((entry) => entry?.text ?? "")
        .filter((text) => text.length > 0);
      if (texts.length > 0) {
        return texts.join("\n");
      }
    } catch {
      // try next candidate
    }
  }
  return cleaned;
}

function handleChat(request: IncomingMessage, response: ServerResponse): void {
  void (async () => {
    const rawBody = await readBody(request);
    const message = extractMessage(rawBody);

    response.writeHead(200, {
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream"
    });

    const child = spawn(
      CLI_BIN,
      ["agent", "--local", "--json", "--agent", AGENT_ID, "-m", message],
      { env: { ...process.env, OPENCLAW_HOME: process.env.OPENCLAW_HOME || (process.env.HOME + "/.openclaw-miaochat") }, stdio: ["ignore", "pipe", "pipe"] }
    );

    let stdoutBuffer = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdoutBuffer += chunk;
    });

    child.stderr.setEncoding("utf8");
    child.stderr.on("data", () => {
      /* swallow CLI stderr; never surface to client */
    });

    child.on("error", (error) => {
      response.write(
        sse({ chunk: `openclaw spawn error: ${error.message}`, type: "chunk" })
      );
      response.write(sse("[DONE]"));
      response.end();
    });

    child.on("close", (exitCode) => {
      const final = extractFinalText(stdoutBuffer);
      const text =
        final.length > 0
          ? final
          : `(no openclaw output, exit=${exitCode ?? "null"})`;
      response.write(sse({ chunk: text, type: "chunk" }));
      response.write(
        sse({ finalContent: text, type: "completed" })
      );
      response.write(sse("[DONE]"));
      response.end();
    });
  })().catch((error) => {
    if (!response.headersSent) {
      response.writeHead(500, { "Content-Type": "text/plain" });
    }
    response.end(
      `openclaw-shim error: ${error instanceof Error ? error.message : String(error)}\n`
    );
  });
}

const server = createServer((request, response) => {
  if (request.method === "GET" && request.url === "/health") {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(
      JSON.stringify({ agent: AGENT_ID, ok: true, shim: "openclaw" })
    );
    return;
  }

  if (request.method === "POST" && request.url === "/v1/chat/completions") {
    handleChat(request, response);
    return;
  }

  response.writeHead(404, { "Content-Type": "text/plain" });
  response.end("not found\n");
});

server.listen(PORT, HOST, () => {
  process.stdout.write(
    `openclaw-shim listening on http://${HOST}:${PORT} (agent=${AGENT_ID}, bin=${CLI_BIN})\n`
  );
});

const shutdown = (signal: string) => () => {
  process.stdout.write(`openclaw-shim received ${signal}, closing...\n`);
  server.close(() => {
    process.exit(0);
  });
};

process.on("SIGINT", shutdown("SIGINT"));
process.on("SIGTERM", shutdown("SIGTERM"));
