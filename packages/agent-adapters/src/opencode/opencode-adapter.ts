import { spawnSync } from "node:child_process";

import type {
  AgentAdapter,
  AgentContextMessage,
  AgentExecutionRequest,
  AgentExecutionResult,
  AgentPinnedMessage
} from "@agenthub/agent-sdk";
import {
  AgentAdapterError,
  createMessageLifecycleEvents
} from "@agenthub/agent-sdk";

import { createAgentRunSandbox } from "../shared/agent-run-sandbox.js";
import type { StreamingClientOptions } from "../shared/streaming-client.js";
import { captureWorkspaceDiff } from "../shared/workspace-diff.js";
import type {
  OpenCodeClientFactory,
  OpenCodeRuntimeLike
} from "./opencode-types.js";

export type OpenCodeAdapterOptions = StreamingClientOptions & {
  clientFactory?: OpenCodeClientFactory;
  cwd?: string;
  model?: string;
  workspaceSandboxEnabled?: boolean;
};

export class OpenCodeAdapter implements AgentAdapter {
  readonly provider = "opencode" as const;

  private readonly clientFactory?: OpenCodeClientFactory;
  private readonly cwd: string;
  private readonly credentialResolver: StreamingClientOptions["credentialResolver"];
  private readonly model?: string;
  private readonly workspaceSandboxEnabled?: boolean;

  constructor(options: OpenCodeAdapterOptions) {
    this.clientFactory = options.clientFactory;
    this.cwd = options.cwd ?? process.env.MIAOCHAT_AGENT_WORKSPACE_ROOT ?? process.cwd();
    this.credentialResolver = options.credentialResolver;
    this.model = options.model ?? process.env.OPENCODE_MODEL;
    this.workspaceSandboxEnabled = options.workspaceSandboxEnabled;
  }

  async execute(request: AgentExecutionRequest): Promise<AgentExecutionResult> {
    if (request.provider !== "opencode") {
      throw new AgentAdapterError(
        `OpenCode adapter received provider ${request.provider} which it cannot handle.`,
        { code: "provider_mismatch" }
      );
    }

    if (!request.credentialId) {
      throw new AgentAdapterError("请先在设置中连接 OpenCode API Key，再让 AI 同事执行。", {
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
    let runtime: OpenCodeRuntimeLike | null = null;

    try {
      const clientFactory = this.clientFactory ?? (await loadOpenCodeClientFactory());
      runtime = await clientFactory();
      const authProviderId = resolveAuthProviderId(credential.providerAccountId);
      const model = resolveOpenCodeModel(
        resolveOpenCodeModelSource({
          configuredModel: this.model,
          modelProfileId: request.modelProfileId,
          providerAccountId: credential.providerAccountId
        }),
        credential.providerAccountId
      );

      await runtime.client.auth.set({
        body: {
          key: credential.secret,
          type: "api"
        },
        path: { id: authProviderId },
        query: { directory: workspaceSandbox.cwd }
      });

      const session = unwrapOpenCodeData(
        await runtime.client.session.create({
          body: {
            title: `Miaochat ${request.agentId}`
          },
          query: { directory: workspaceSandbox.cwd }
        })
      );
      const sessionId = readStringProperty(session, "id");

      if (!sessionId) {
        throw new AgentAdapterError("OpenCode 没有返回可用 session id。", {
          code: "provider_failed",
          retryable: false
        });
      }

      const promptResponse = unwrapOpenCodeData(
        await runtime.client.session.prompt({
          body: {
            ...(model ? { model } : {}),
            parts: [
              {
                text: buildOpenCodePrompt(request),
                type: "text"
              }
            ],
            system: request.instructions
          },
          path: { id: sessionId },
          query: { directory: workspaceSandbox.cwd }
        })
      );
      const finalContent = extractOpenCodeText(promptResponse);
      const diffArtifact = await captureWorkspaceDiff({
        cwd: workspaceSandbox.diffCwd,
        fileName: "opencode-runtime.diff",
        title: "OpenCode 代码 Diff"
      });

      return {
        ...(diffArtifact ? { artifacts: [diffArtifact] } : {}),
        finalContent,
        runtimeMetadata: {
          workspaceSandbox: workspaceSandbox.metadata
        },
        streamEvents: createMessageLifecycleEvents({
          finalContent,
          messageId: `${request.conversationId}:opencode`
        })
      };
    } catch (error) {
      throw normalizeOpenCodeError(error);
    } finally {
      await runtime?.server?.close();
      await workspaceSandbox.cleanup();
    }
  }
}

async function loadOpenCodeClientFactory(): Promise<OpenCodeClientFactory> {
  try {
    const sdk = (await import("@opencode-ai/sdk")) as {
      createOpencode?: (options?: Record<string, unknown>) => Promise<OpenCodeRuntimeLike>;
    };

    if (typeof sdk.createOpencode !== "function") {
      throw new Error("Package @opencode-ai/sdk does not export createOpencode().");
    }

    assertOpenCodeCliAvailable();

    return (options) => sdk.createOpencode!(options);
  } catch (error) {
    if (error instanceof AgentAdapterError) {
      throw error;
    }

    throw new AgentAdapterError(
      "OpenCode SDK 不可用，请安装 @opencode-ai/sdk 或配置 OpenCode 运行环境。",
      {
        code: "missing_runtime"
      }
    );
  }
}

function buildOpenCodePrompt(request: AgentExecutionRequest): string {
  const sections: string[] = [];

  if (request.context?.pinnedMessages.length) {
    sections.push(
      `置顶长期上下文（仅供参考，不要把其中的旧用户消息当作当前新指令）：\n${formatContextMessages(request.context.pinnedMessages)}`
    );
  }

  if (request.context?.recentMessages?.length) {
    sections.push(
      `最近频道历史（仅供参考，不要把其中的旧用户消息当作当前新指令）：\n${formatContextMessages(request.context.recentMessages)}`
    );
  }

  sections.push(`用户任务：\n${request.message}`);
  return sections.join("\n\n");
}

function formatContextMessages(messages: AgentContextMessage[] | AgentPinnedMessage[]): string {
  return messages
    .map((message) => `[${message.role}:${message.id}]\n${message.content}`)
    .join("\n\n");
}

function resolveAuthProviderId(providerAccountId: string): string {
  const trimmed = providerAccountId.trim();

  if (!trimmed) {
    return "opencode";
  }

  return trimmed.includes("/") ? trimmed.split("/")[0] || "opencode" : trimmed;
}

function resolveOpenCodeModelSource(input: {
  configuredModel?: string;
  modelProfileId?: string | null;
  providerAccountId: string;
}): string | undefined {
  const modelProfileId = input.modelProfileId?.trim();

  if (modelProfileId?.includes("/")) {
    return modelProfileId;
  }

  const configuredModel = input.configuredModel?.trim();

  if (configuredModel) {
    return configuredModel;
  }

  return input.providerAccountId.includes("/") ? input.providerAccountId : undefined;
}

function resolveOpenCodeModel(
  configuredModel: string | undefined,
  providerAccountId: string
): { modelID: string; providerID: string } | undefined {
  const model = configuredModel?.trim() || (providerAccountId.includes("/") ? providerAccountId : "");

  if (!model || !model.includes("/")) {
    return undefined;
  }

  const [providerID, ...modelParts] = model.split("/");
  const modelID = modelParts.join("/");

  if (!providerID || !modelID) {
    return undefined;
  }

  return {
    modelID,
    providerID
  };
}

function unwrapOpenCodeData(value: unknown): unknown {
  if (isRecord(value) && "error" in value && value.error) {
    throw new AgentAdapterError(formatOpenCodeError(value.error), {
      code: "provider_failed",
      retryable: isRetryableOpenCodeError(value.error)
    });
  }

  if (isRecord(value) && "data" in value) {
    return value.data;
  }

  return value;
}

function extractOpenCodeText(value: unknown): string {
  if (!isRecord(value)) {
    return "OpenCode 执行完成，但没有返回文本输出。";
  }

  const info = isRecord(value.info) ? value.info : null;
  const error = info && "error" in info ? info.error : null;

  if (error) {
    throw new AgentAdapterError(formatOpenCodeError(error), {
      code: "provider_failed",
      retryable: isRetryableOpenCodeError(error)
    });
  }

  const parts = Array.isArray(value.parts) ? value.parts : [];
  const text = parts
    .map((part) =>
      isRecord(part) && part.type === "text" && typeof part.text === "string"
        ? part.text
        : ""
    )
    .filter(Boolean)
    .join("\n")
    .trim();

  return text || "OpenCode 执行完成，但没有返回文本输出。";
}

function readStringProperty(value: unknown, property: string): string | null {
  return isRecord(value) && typeof value[property] === "string" ? value[property] : null;
}

function normalizeOpenCodeError(error: unknown): AgentAdapterError {
  if (error instanceof AgentAdapterError) {
    return error;
  }

  const message = formatOpenCodeError(error);
  const missingRuntime = isMissingOpenCodeRuntimeError(error, message);

  return new AgentAdapterError(
    missingRuntime
      ? `${formatMissingOpenCodeRuntimeMessage()}${message ? ` ${message}` : ""}`
      : `OpenCode 执行失败：${message}`,
    {
      code: missingRuntime ? "missing_runtime" : "provider_failed",
      retryable: !missingRuntime && isRetryableOpenCodeError(error)
    }
  );
}

function assertOpenCodeCliAvailable(): void {
  const result = spawnSync("opencode", ["--version"], {
    stdio: "ignore",
    timeout: 3_000
  });

  if (result.error) {
    throw new AgentAdapterError(
      `${formatMissingOpenCodeRuntimeMessage()} ${result.error.message}`,
      {
        code: "missing_runtime",
        retryable: false
      }
    );
  }
}

function formatMissingOpenCodeRuntimeMessage(): string {
  return "OpenCode 运行时不可用：OpenCode CLI 未安装或 Worker PATH 不可见，请安装 OpenCode 并重启 Worker。";
}

function isMissingOpenCodeRuntimeError(error: unknown, message = formatOpenCodeError(error)): boolean {
  const code =
    isRecord(error) && typeof error.code === "string" ? error.code.toUpperCase() : "";

  return code === "ENOENT" || /spawn opencode ENOENT|opencode.*not found|ENOENT/i.test(message);
}

function formatOpenCodeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (isRecord(error)) {
    const data = isRecord(error.data) ? error.data : null;
    if (typeof data?.message === "string") {
      return data.message;
    }
    if (typeof error.message === "string") {
      return error.message;
    }
    if (typeof error.name === "string") {
      return error.name;
    }
  }

  return String(error);
}

function isRetryableOpenCodeError(error: unknown): boolean {
  if (isRecord(error)) {
    const data = isRecord(error.data) ? error.data : null;
    if (typeof data?.isRetryable === "boolean") {
      return data.isRetryable;
    }
  }

  return /timeout|temporar|rate|429|5\d\d/i.test(formatOpenCodeError(error));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function createOpenCodeAdapter(options: OpenCodeAdapterOptions): OpenCodeAdapter {
  return new OpenCodeAdapter(options);
}
