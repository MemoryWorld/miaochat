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
  ClaudeAgentQuery,
  ClaudeAgentSdkMessage,
  ClaudeCodePermissionMode
} from "./claude-code-types.js";

export type ClaudeCodeAdapterOptions = StreamingClientOptions & {
  allowedTools?: string[];
  cwd?: string;
  env?: Record<string, string | undefined>;
  maxTurns?: number;
  model?: string;
  pathToClaudeCodeExecutable?: string;
  permissionMode?: ClaudeCodePermissionMode;
  queryImpl?: ClaudeAgentQuery;
  workspaceSandboxEnabled?: boolean;
};

const defaultAllowedTools = ["Read", "Edit", "Glob", "Grep"];

export class ClaudeCodeAdapter implements AgentAdapter {
  readonly provider = "claude-code" as const;

  private readonly allowedTools: string[];
  private readonly cwd: string;
  private readonly credentialResolver: StreamingClientOptions["credentialResolver"];
  private readonly env: Record<string, string | undefined>;
  private readonly maxTurns?: number;
  private readonly model?: string;
  private readonly pathToClaudeCodeExecutable?: string;
  private readonly permissionMode: ClaudeCodePermissionMode;
  private readonly queryImpl?: ClaudeAgentQuery;
  private readonly workspaceSandboxEnabled?: boolean;

  constructor(options: ClaudeCodeAdapterOptions) {
    this.allowedTools = options.allowedTools ?? defaultAllowedTools;
    this.cwd = options.cwd ?? process.env.MIAOCHAT_AGENT_WORKSPACE_ROOT ?? process.cwd();
    this.credentialResolver = options.credentialResolver;
    this.env = options.env ?? {};
    this.maxTurns = options.maxTurns;
    this.model = options.model ?? process.env.CLAUDE_CODE_MODEL;
    this.pathToClaudeCodeExecutable =
      options.pathToClaudeCodeExecutable ?? process.env.CLAUDE_CODE_EXECUTABLE;
    this.permissionMode = options.permissionMode ?? "acceptEdits";
    this.queryImpl = options.queryImpl;
    this.workspaceSandboxEnabled = options.workspaceSandboxEnabled;
  }

  async execute(request: AgentExecutionRequest): Promise<AgentExecutionResult> {
    if (request.provider !== "claude-code") {
      throw new AgentAdapterError(
        `Claude Code adapter received provider ${request.provider} which it cannot handle.`,
        { code: "provider_mismatch" }
      );
    }

    if (!request.credentialId) {
      throw new AgentAdapterError("请先在设置中连接 Claude API Key，再让 AI 同事执行。", {
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
      const query = this.queryImpl ?? (await loadClaudeAgentQuery());
      const messageId = `${request.conversationId}:claude-code`;
      const streamEvents: StreamEvent[] = [
        {
          kind: "conversation.message.started",
          payload: { messageId }
        }
      ];
      const deltas: string[] = [];
      let resultText: string | null = null;

      try {
        for await (const message of query({
          options: pruneUndefined({
            allowedTools: this.allowedTools,
            cwd: workspaceSandbox.cwd,
            env: {
              ...process.env,
              ...this.env,
              ANTHROPIC_API_KEY: credential.secret,
              CLAUDE_AGENT_SDK_CLIENT_APP: "miaochat"
            },
            maxTurns: this.maxTurns,
            model: this.model,
            pathToClaudeCodeExecutable: this.pathToClaudeCodeExecutable,
            permissionMode: this.permissionMode,
            systemPrompt: request.instructions
          }),
          prompt: buildClaudePrompt(request.message, request.context?.pinnedMessages)
        })) {
          const assistantText = extractAssistantText(message);
          for (const delta of assistantText) {
            deltas.push(delta);
            streamEvents.push({
              kind: "conversation.message.delta",
              payload: { delta, messageId }
            });
          }

          const extractedResult = extractResultText(message);
          if (extractedResult) {
            resultText = extractedResult;
          }
        }
      } catch (error) {
        throw normalizeClaudeSdkError(error);
      }

      const finalContent = resultText?.trim() || deltas.join("").trim();

      streamEvents.push({
        kind: "conversation.message.completed",
        payload: { finalContent, messageId }
      });

      const diffArtifact = await captureWorkspaceDiff({
        cwd: workspaceSandbox.diffCwd,
        fileName: "claude-code-runtime.diff",
        title: "Claude Code 代码 Diff"
      });

      return {
        ...(diffArtifact ? { artifacts: [diffArtifact] } : {}),
        finalContent,
        streamEvents
      };
    } finally {
      await workspaceSandbox.cleanup();
    }
  }
}

async function loadClaudeAgentQuery(): Promise<ClaudeAgentQuery> {
  try {
    const sdk = (await import("@anthropic-ai/claude-agent-sdk")) as {
      query?: ClaudeAgentQuery;
    };

    if (typeof sdk.query !== "function") {
      throw new Error("Package @anthropic-ai/claude-agent-sdk does not export query().");
    }

    return sdk.query;
  } catch {
    throw new AgentAdapterError(
      "Claude Code SDK 不可用，请安装 @anthropic-ai/claude-agent-sdk 或配置 Claude 运行环境。",
      {
        code: "missing_runtime"
      }
    );
  }
}

function buildClaudePrompt(message: string, pinnedMessages: AgentPinnedMessage[] = []): string {
  if (pinnedMessages.length === 0) {
    return message;
  }

  const pinnedContext = pinnedMessages
    .map((pinned) => `[${pinned.role}:${pinned.id}]\n${pinned.content}`)
    .join("\n\n");

  return `以下是 Miaochat 置顶上下文，请在执行任务时参考：\n\n${pinnedContext}\n\n用户任务：\n${message}`;
}

function extractAssistantText(message: ClaudeAgentSdkMessage): string[] {
  if (message.type !== "assistant" || !Array.isArray(message.content)) {
    return [];
  }

  const textBlocks: string[] = [];

  for (const block of message.content) {
    if (typeof block === "string") {
      textBlocks.push(block);
      continue;
    }

    if (isRecord(block) && typeof block.text === "string") {
      textBlocks.push(block.text);
    }
  }

  return textBlocks;
}

function extractResultText(message: ClaudeAgentSdkMessage): string | null {
  if (message.type !== "result") {
    return null;
  }

  if (typeof message.result === "string") {
    return message.result;
  }

  if (isRecord(message.result) && typeof message.result.text === "string") {
    return message.result.text;
  }

  return null;
}

function normalizeClaudeSdkError(error: unknown): AgentAdapterError {
  if (error instanceof AgentAdapterError) {
    return error;
  }

  const message = error instanceof Error ? error.message : String(error);

  return new AgentAdapterError(`Claude Code 执行失败：${message}`, {
    code: "provider_failed",
    retryable: /timeout|temporar|rate|429|5\d\d/i.test(message)
  });
}

function pruneUndefined(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function createClaudeCodeAdapter(
  options: ClaudeCodeAdapterOptions
): ClaudeCodeAdapter {
  return new ClaudeCodeAdapter(options);
}
