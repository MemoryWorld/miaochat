import type {
  CodexOptions as OpenAICodexOptions,
  ThreadEvent as OpenAICodexThreadEvent,
  ThreadOptions as OpenAICodexThreadOptions
} from "@openai/codex-sdk";

export type CodexApprovalPolicy = NonNullable<
  OpenAICodexThreadOptions["approvalPolicy"]
>;
export type CodexConfigObject = NonNullable<OpenAICodexOptions["config"]>;
export type CodexSandboxMode = NonNullable<OpenAICodexThreadOptions["sandboxMode"]>;
export type CodexSdkClientOptions = Omit<OpenAICodexOptions, "env"> & {
  env?: Record<string, string>;
};
export type CodexThreadEvent = OpenAICodexThreadEvent;
export type CodexThreadOptions = OpenAICodexThreadOptions;

export type CodexStreamedTurn = {
  events: AsyncGenerator<CodexThreadEvent>;
};

export type CodexThreadLike = {
  runStreamed(input: string): Promise<CodexStreamedTurn>;
};

export type CodexClientLike = {
  startThread(options?: CodexThreadOptions): CodexThreadLike;
};

export type CodexClientFactory = (
  options?: CodexSdkClientOptions
) => CodexClientLike;
