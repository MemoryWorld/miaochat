import { spawn } from "node:child_process";

import type {
  AgentAdapter,
  AgentExecutionRequest,
  AgentExecutionResult,
  AgentPinnedMessage
} from "@agenthub/agent-sdk";
import { AgentAdapterError } from "@agenthub/agent-sdk";
import type { StreamEvent } from "@agenthub/contracts";

import type { StreamingClientOptions } from "../shared/streaming-client.js";
import { captureWorkspaceDiff } from "../shared/workspace-diff.js";
import type {
  CodexCommandRunner,
  CodexExecEvent,
  CodexSandboxMode
} from "./codex-types.js";

export type CodexAdapterOptions = StreamingClientOptions & {
  cwd?: string;
  env?: Record<string, string | undefined>;
  executable?: string;
  model?: string;
  runner?: CodexCommandRunner;
  sandbox?: CodexSandboxMode;
};

export class CodexAdapter implements AgentAdapter {
  readonly provider = "codex" as const;

  private readonly cwd: string;
  private readonly credentialResolver: StreamingClientOptions["credentialResolver"];
  private readonly env: Record<string, string | undefined>;
  private readonly executable: string;
  private readonly model?: string;
  private readonly runner: CodexCommandRunner;
  private readonly sandbox: CodexSandboxMode;

  constructor(options: CodexAdapterOptions) {
    this.cwd = options.cwd ?? process.env.MIAOCHAT_AGENT_WORKSPACE_ROOT ?? process.cwd();
    this.credentialResolver = options.credentialResolver;
    this.env = options.env ?? {};
    this.executable = options.executable ?? process.env.CODEX_EXECUTABLE ?? "codex";
    this.model = options.model ?? process.env.CODEX_MODEL;
    this.runner = options.runner ?? runCodexCommand;
    this.sandbox = options.sandbox ?? "workspace-write";
  }

  async execute(request: AgentExecutionRequest): Promise<AgentExecutionResult> {
    if (request.provider !== "codex") {
      throw new AgentAdapterError(
        `Codex adapter received provider ${request.provider} which it cannot handle.`,
        { code: "provider_mismatch" }
      );
    }

    if (!request.credentialId) {
      throw new AgentAdapterError("请先在设置中连接 Codex API Key，再让 AI 同事执行。", {
        code: "missing_credential"
      });
    }

    const credential = await this.credentialResolver({
      credentialId: request.credentialId,
      workspaceId: request.workspaceId
    });
    const args = buildCodexArgs({
      model: this.model,
      sandbox: this.sandbox
    });
    const result = await this.runner({
      args,
      command: this.executable,
      cwd: this.cwd,
      env: {
        ...process.env,
        ...this.env,
        CODEX_API_KEY: credential.secret
      },
      stdin: buildCodexPrompt(request)
    });

    if (result.exitCode !== 0) {
      throw new AgentAdapterError(formatCodexFailure(result), {
        code: result.exitCode === 127 ? "missing_runtime" : "provider_failed",
        retryable: /timeout|temporar|rate|429|5\d\d/i.test(result.stderr)
      });
    }

    const execution = parseCodexExecution({
      conversationId: request.conversationId,
      stdout: result.stdout
    });
    const diffArtifact = await captureWorkspaceDiff({
      cwd: this.cwd,
      fileName: "codex-runtime.diff",
      title: "Codex 代码 Diff"
    });

    return {
      ...execution,
      ...(diffArtifact ? { artifacts: [diffArtifact] } : {})
    };
  }
}

function buildCodexArgs(input: {
  model?: string;
  sandbox: CodexSandboxMode;
}): string[] {
  const args = [
    "exec",
    "--json",
    "--ephemeral",
    "--sandbox",
    input.sandbox,
    "--ask-for-approval",
    "never"
  ];

  if (input.model) {
    args.push("--model", input.model);
  }

  args.push("-");
  return args;
}

function buildCodexPrompt(request: AgentExecutionRequest): string {
  const sections: string[] = [];

  if (request.instructions?.trim()) {
    sections.push(`Miaochat AI 同事运行说明：\n${request.instructions.trim()}`);
  }

  if (request.context?.pinnedMessages.length) {
    sections.push(`置顶上下文：\n${formatPinnedMessages(request.context.pinnedMessages)}`);
  }

  sections.push(`用户任务：\n${request.message}`);
  return sections.join("\n\n");
}

function formatPinnedMessages(pinnedMessages: AgentPinnedMessage[]): string {
  return pinnedMessages
    .map((pinned) => `[${pinned.role}:${pinned.id}]\n${pinned.content}`)
    .join("\n\n");
}

async function runCodexCommand(input: {
  args: string[];
  command: string;
  cwd: string;
  env: Record<string, string | undefined>;
  stdin: string;
}): Promise<{ exitCode: number; stderr: string; stdout: string }> {
  return new Promise((resolve) => {
    const child = spawn(input.command, input.args, {
      cwd: input.cwd,
      env: input.env,
      stdio: ["pipe", "pipe", "pipe"]
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];

    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));

    child.on("error", (error) => {
      resolve({
        exitCode: 127,
        stderr: error.message,
        stdout: ""
      });
    });

    child.on("close", (exitCode) => {
      resolve({
        exitCode: exitCode ?? 1,
        stderr: Buffer.concat(stderr).toString("utf8"),
        stdout: Buffer.concat(stdout).toString("utf8")
      });
    });

    child.stdin.end(input.stdin);
  });
}

function parseCodexExecution(input: {
  conversationId: string;
  stdout: string;
}): AgentExecutionResult {
  const messageId = `${input.conversationId}:codex`;
  const streamEvents: StreamEvent[] = [
    {
      kind: "conversation.message.started",
      payload: { messageId }
    }
  ];
  const deltas: string[] = [];
  const fallbackText = input.stdout.trim();

  for (const line of input.stdout.split(/\r?\n/)) {
    const event = parseCodexEvent(line);

    if (!event) {
      continue;
    }

    if (event.type === "error") {
      throw new AgentAdapterError(extractCodexErrorMessage(event.error), {
        code: "provider_failed",
        retryable: true
      });
    }

    if (event.type === "item.completed" && event.item?.type === "agent_message") {
      const delta = event.item.text;

      if (typeof delta === "string" && delta.length > 0) {
        deltas.push(delta);
        streamEvents.push({
          kind: "conversation.message.delta",
          payload: { delta, messageId }
        });
      }
    }
  }

  const finalContent = deltas.join("\n").trim() || fallbackText;

  streamEvents.push({
    kind: "conversation.message.completed",
    payload: { finalContent, messageId }
  });

  return {
    finalContent,
    streamEvents
  };
}

function parseCodexEvent(line: string): CodexExecEvent | null {
  const trimmed = line.trim();

  if (!trimmed.startsWith("{")) {
    return null;
  }

  try {
    return JSON.parse(trimmed) as CodexExecEvent;
  } catch {
    return null;
  }
}

function formatCodexFailure(result: { exitCode: number; stderr: string }): string {
  const details = result.stderr.trim();

  if (result.exitCode === 127) {
    return `Codex CLI 不可用，请安装 codex 或配置 CODEX_EXECUTABLE。${details ? ` ${details}` : ""}`;
  }

  return `Codex 执行失败。${details ? ` ${details}` : ""}`;
}

function extractCodexErrorMessage(error: unknown): string {
  if (typeof error === "string") {
    return error;
  }

  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") {
      return message;
    }
  }

  return "Codex 执行失败。";
}

export function createCodexAdapter(options: CodexAdapterOptions): CodexAdapter {
  return new CodexAdapter(options);
}
