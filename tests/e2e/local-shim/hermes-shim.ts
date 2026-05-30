/*
 * Hermes local shim.
 *
 * Bridges the HermesAdapter's expected HTTP protocol
 *   POST /v1/messages/stream  -> NDJSON: {"type":"started"}
 *                                       {"type":"delta","text":"..."}
 *                                       {"type":"done"}
 * to the real `hermes` CLI installed on the developer machine.
 *
 * The real CLI prints plain text in `-Q -q` quiet mode, with a `session_id:`
 * line and a possible warning header when no auxiliary LLM provider is
 * configured. The shim filters known noise patterns and emits the remaining
 * lines as adapter delta frames.
 *
 * Configuration via env:
 *   HERMES_SHIM_HOST       default "127.0.0.1"
 *   HERMES_SHIM_PORT       default 19003
 *   HERMES_SHIM_PROVIDER   default "openrouter"
 *   HERMES_SHIM_MODEL      default "deepseek/deepseek-chat"
 *   HERMES_BIN             default "hermes"
 *
 * No API keys are read or persisted by this file. The underlying CLI inherits
 * the parent shell environment (e.g. OPENROUTER_API_KEY).
 */

import { Buffer } from "node:buffer";
import { spawn } from "node:child_process";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse
} from "node:http";

const HOST = process.env.HERMES_SHIM_HOST ?? "127.0.0.1";
const PORT = Number(process.env.HERMES_SHIM_PORT ?? 19003);
const PROVIDER = process.env.HERMES_SHIM_PROVIDER ?? "";
const MODEL = process.env.HERMES_SHIM_MODEL ?? "";
const CLI_BIN = process.env.HERMES_BIN ?? "hermes";

type HermesBody = {
  prompt?: string;
};

const NOISE_PATTERNS: RegExp[] = [
  /^session_id:/i,
  /^⚠/,
  /^warning:/i,
  /^\[hermes\]/i,
  /no auxiliary llm provider configured/i,
  /run `hermes setup`/i
];

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
    const parsed = JSON.parse(rawBody) as HermesBody;
    if (typeof parsed.prompt === "string" && parsed.prompt.length > 0) {
      return parsed.prompt;
    }
  } catch {
    // fall through to default
  }
  return "ping";
}

function ndjson(payload: unknown): string {
  return `${JSON.stringify(payload)}\n`;
}

function stripAnsi(input: string): string {
  // eslint-disable-next-line no-control-regex
  return input.replace(/\x1b\[[0-9;]*m/g, "");
}

function isNoise(line: string): boolean {
  if (line.length === 0) {
    return true;
  }
  for (const pattern of NOISE_PATTERNS) {
    if (pattern.test(line)) {
      return true;
    }
  }
  return false;
}

function handleStream(request: IncomingMessage, response: ServerResponse): void {
  void (async () => {
    const rawBody = await readBody(request);
    const prompt = extractMessage(rawBody);

    response.writeHead(200, {
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Content-Type": "application/x-ndjson"
    });

    response.write(ndjson({ type: "started" }));

    const child = spawn(
      CLI_BIN,
      ["chat", "-Q", "--max-turns", "1", "--accept-hooks", "-q", prompt, ...(PROVIDER ? ["--provider", PROVIDER] : []), ...(MODEL ? ["-m", MODEL] : [])],
      { stdio: ["ignore", "pipe", "pipe"] }
    );

    let buffer = "";
    let emittedAny = false;

    const flushLines = (chunk: string): void => {
      buffer += chunk;
      let newlineIndex = buffer.indexOf("\n");
      while (newlineIndex >= 0) {
        const rawLine = buffer.slice(0, newlineIndex);
        buffer = buffer.slice(newlineIndex + 1);
        const line = stripAnsi(rawLine.replace(/\r$/, "")).trim();
        if (!isNoise(line)) {
          response.write(ndjson({ text: line, type: "delta" }));
          emittedAny = true;
        }
        newlineIndex = buffer.indexOf("\n");
      }
    };

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", flushLines);

    child.stderr.setEncoding("utf8");
    child.stderr.on("data", () => {
      /* swallow CLI stderr; never surface to client */
    });

    child.on("error", (error) => {
      response.write(
        ndjson({
          text: `hermes spawn error: ${error.message}`,
          type: "delta"
        })
      );
      response.write(ndjson({ type: "done" }));
      response.end();
    });

    child.on("close", (exitCode) => {
      const tail = stripAnsi(buffer).trim();
      if (tail.length > 0 && !isNoise(tail)) {
        response.write(ndjson({ text: tail, type: "delta" }));
        emittedAny = true;
      }
      if (!emittedAny) {
        response.write(
          ndjson({
            text: `(no hermes output, exit=${exitCode ?? "null"})`,
            type: "delta"
          })
        );
      }
      response.write(ndjson({ type: "done" }));
      response.end();
    });
  })().catch((error) => {
    if (!response.headersSent) {
      response.writeHead(500, { "Content-Type": "text/plain" });
    }
    response.end(
      `hermes-shim error: ${error instanceof Error ? error.message : String(error)}\n`
    );
  });
}

const server = createServer((request, response) => {
  if (request.method === "GET" && request.url === "/health") {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(
      JSON.stringify({ model: MODEL, ok: true, provider: PROVIDER, shim: "hermes" })
    );
    return;
  }

  if (request.method === "POST" && request.url === "/v1/messages/stream") {
    handleStream(request, response);
    return;
  }

  response.writeHead(404, { "Content-Type": "text/plain" });
  response.end("not found\n");
});

server.listen(PORT, HOST, () => {
  process.stdout.write(
    `hermes-shim listening on http://${HOST}:${PORT} (provider=${PROVIDER}, model=${MODEL}, bin=${CLI_BIN})\n`
  );
});

const shutdown = (signal: string) => () => {
  process.stdout.write(`hermes-shim received ${signal}, closing...\n`);
  server.close(() => {
    process.exit(0);
  });
};

process.on("SIGINT", shutdown("SIGINT"));
process.on("SIGTERM", shutdown("SIGTERM"));
