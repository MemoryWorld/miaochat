import type {
  AgentAdapter,
  AgentExecutionRequest,
  AgentExecutionResult,
  AgentPinnedMessage
} from "@agenthub/agent-sdk";
import { AgentAdapterError } from "@agenthub/agent-sdk";
import type { StreamEvent } from "@agenthub/contracts";

import type { StreamingClientOptions } from "../shared/streaming-client.js";
import { createAgentRunSandbox } from "../shared/agent-run-sandbox.js";
import { captureWorkspaceDiff } from "../shared/workspace-diff.js";
import type {
  CodexApprovalPolicy,
  CodexClientFactory,
  CodexConfigObject,
  CodexSandboxMode,
  CodexThreadEvent
} from "./codex-types.js";

const codexEnvPassThroughKeys = [
  "HOME",
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "LANG",
  "LC_ALL",
  "LOGNAME",
  "NO_PROXY",
  "PATH",
  "SHELL",
  "SSL_CERT_DIR",
  "SSL_CERT_FILE",
  "TEMP",
  "TMP",
  "TMPDIR",
  "USER"
];

export type CodexAdapterOptions = StreamingClientOptions & {
  approvalPolicy?: CodexApprovalPolicy;
  baseUrl?: string;
  clientFactory?: CodexClientFactory;
  codexPathOverride?: string;
  config?: CodexConfigObject;
  cwd?: string;
  env?: Record<string, string | undefined>;
  executable?: string;
  model?: string;
  networkAccessEnabled?: boolean;
  sandbox?: CodexSandboxMode;
  skipGitRepoCheck?: boolean;
  workspaceSandboxEnabled?: boolean;
};

export class CodexAdapter implements AgentAdapter {
  readonly provider = "codex" as const;

  private readonly approvalPolicy: CodexApprovalPolicy;
  private readonly baseUrl?: string;
  private readonly clientFactory?: CodexClientFactory;
  private readonly codexPathOverride?: string;
  private readonly config?: CodexConfigObject;
  private readonly cwd: string;
  private readonly credentialResolver: StreamingClientOptions["credentialResolver"];
  private readonly env: Record<string, string | undefined>;
  private readonly model?: string;
  private readonly networkAccessEnabled: boolean;
  private readonly sandbox: CodexSandboxMode;
  private readonly skipGitRepoCheck?: boolean;
  private readonly workspaceSandboxEnabled?: boolean;

  constructor(options: CodexAdapterOptions) {
    this.approvalPolicy = options.approvalPolicy ?? "never";
    this.baseUrl = options.baseUrl;
    this.clientFactory = options.clientFactory;
    this.codexPathOverride =
      options.codexPathOverride ??
      options.executable ??
      process.env.CODEX_PATH_OVERRIDE ??
      process.env.CODEX_EXECUTABLE;
    this.config = options.config;
    this.cwd = options.cwd ?? process.env.MIAOCHAT_AGENT_WORKSPACE_ROOT ?? process.cwd();
    this.credentialResolver = options.credentialResolver;
    this.env = options.env ?? {};
    this.model = options.model ?? process.env.CODEX_MODEL;
    this.networkAccessEnabled =
      options.networkAccessEnabled ?? parseOptionalBoolean(process.env.CODEX_NETWORK_ACCESS_ENABLED) ?? false;
    this.sandbox = options.sandbox ?? "workspace-write";
    this.skipGitRepoCheck = options.skipGitRepoCheck;
    this.workspaceSandboxEnabled = options.workspaceSandboxEnabled;
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
    const workspaceSandbox = await createAgentRunSandbox({
      cwd: this.cwd,
      enabled: this.workspaceSandboxEnabled,
      provider: this.provider
    });

    try {
      let execution: AgentExecutionResult;

      try {
        const clientFactory = this.clientFactory ?? (await loadCodexClientFactory());
        const client = clientFactory(
          pruneUndefined({
            apiKey: credential.secret,
            baseUrl: this.baseUrl,
            codexPathOverride: this.codexPathOverride,
            config: this.config,
            env: buildCodexEnv(this.env)
          })
        );
        const thread = client.startThread(
          pruneUndefined({
            approvalPolicy: this.approvalPolicy,
            model: this.model,
            networkAccessEnabled: this.networkAccessEnabled,
            sandboxMode: this.sandbox,
            skipGitRepoCheck: this.skipGitRepoCheck,
            workingDirectory: workspaceSandbox.cwd
          })
        );

        execution = await runCodexSdkThread({
          conversationId: request.conversationId,
          prompt: buildCodexPrompt(request),
          thread
        });
      } catch (error) {
        throw normalizeCodexSdkError(error);
      }

      const diffArtifact = await captureWorkspaceDiff({
        cwd: workspaceSandbox.diffCwd,
        fileName: "codex-runtime.diff",
        title: "Codex 代码 Diff"
      });

      return {
        ...execution,
        ...(diffArtifact ? { artifacts: [diffArtifact] } : {})
      };
    } finally {
      await workspaceSandbox.cleanup();
    }
  }
}

async function loadCodexClientFactory(): Promise<CodexClientFactory> {
  try {
    const sdk = (await import("@openai/codex-sdk")) as {
      Codex?: new (options?: Parameters<CodexClientFactory>[0]) => ReturnType<CodexClientFactory>;
    };

    if (typeof sdk.Codex !== "function") {
      throw new Error("Package @openai/codex-sdk does not export Codex.");
    }

    return (options) => new sdk.Codex!(options);
  } catch {
    throw new AgentAdapterError(
      "Codex SDK 不可用，请安装 @openai/codex-sdk 或配置 Codex 运行环境。",
      {
        code: "missing_runtime"
      }
    );
  }
}

async function runCodexSdkThread(input: {
  conversationId: string;
  prompt: string;
  thread: { runStreamed(prompt: string): Promise<{ events: AsyncGenerator<CodexThreadEvent> }> };
}): Promise<AgentExecutionResult> {
  const messageId = `${input.conversationId}:codex`;
  const streamEvents: StreamEvent[] = [
    {
      kind: "conversation.message.started",
      payload: { messageId }
    }
  ];
  const deltas: string[] = [];
  const streamedTurn = await input.thread.runStreamed(input.prompt);

  for await (const event of streamedTurn.events) {
    appendCodexEvent({
      deltas,
      event,
      messageId,
      streamEvents
    });
  }

  const finalContent = deltas.join("\n").trim();

  streamEvents.push({
    kind: "conversation.message.completed",
    payload: { finalContent, messageId }
  });

  return {
    finalContent,
    streamEvents
  };
}

function appendCodexEvent(input: {
  deltas: string[];
  event: CodexThreadEvent;
  messageId: string;
  streamEvents: StreamEvent[];
}): void {
  if (input.event.type === "error") {
    throw new AgentAdapterError(`Codex SDK 执行失败。${input.event.message}`, {
      code: "provider_failed",
      retryable: isRetryableCodexMessage(input.event.message)
    });
  }

  if (input.event.type === "turn.failed") {
    const message = input.event.error.message;

    throw new AgentAdapterError(`Codex SDK 执行失败。${message}`, {
      code: "provider_failed",
      retryable: isRetryableCodexMessage(message)
    });
  }

  if (input.event.type !== "item.completed") {
    return;
  }

  if (input.event.item.type === "error") {
    throw new AgentAdapterError(`Codex SDK 执行失败。${input.event.item.message}`, {
      code: "provider_failed",
      retryable: isRetryableCodexMessage(input.event.item.message)
    });
  }

  if (input.event.item.type !== "agent_message") {
    return;
  }

  const delta = input.event.item.text.trim();

  if (!delta) {
    return;
  }

  input.deltas.push(delta);
  input.streamEvents.push({
    kind: "conversation.message.delta",
    payload: { delta, messageId: input.messageId }
  });
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

function buildCodexEnv(overrides: Record<string, string | undefined>): Record<string, string> {
  const env: Record<string, string> = {};

  for (const key of codexEnvPassThroughKeys) {
    const value = process.env[key];

    if (typeof value === "string") {
      env[key] = value;
    }
  }

  for (const [key, value] of Object.entries(overrides)) {
    if (typeof value === "string") {
      env[key] = value;
      continue;
    }

    delete env[key];
  }

  return env;
}

function parseOptionalBoolean(value: string | undefined): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (/^(1|true|yes)$/i.test(value)) {
    return true;
  }

  if (/^(0|false|no)$/i.test(value)) {
    return false;
  }

  return undefined;
}

function normalizeCodexSdkError(error: unknown): AgentAdapterError {
  if (error instanceof AgentAdapterError) {
    return error;
  }

  const message = extractCodexErrorMessage(error);
  const missingRuntime = /ENOENT|not found|cannot find package|codex sdk|codex.*unavailable/i.test(
    message
  );

  return new AgentAdapterError(
    missingRuntime
      ? `Codex SDK 不可用，请安装 @openai/codex-sdk 或配置 Codex 运行环境。${message ? ` ${message}` : ""}`
      : `Codex SDK 执行失败。${message ? ` ${message}` : ""}`,
    {
      code: missingRuntime ? "missing_runtime" : "provider_failed",
      retryable: !missingRuntime && isRetryableCodexMessage(message)
    }
  );
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

  return "";
}

function isRetryableCodexMessage(message: string): boolean {
  return /timeout|temporar|rate|429|5\d\d|ECONNRESET|ETIMEDOUT/i.test(message);
}

function pruneUndefined<T extends Record<string, unknown>>(input: T): T {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined)
  ) as T;
}

export function createCodexAdapter(options: CodexAdapterOptions): CodexAdapter {
  return new CodexAdapter(options);
}
