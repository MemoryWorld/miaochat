export type ProviderKey = "claude-code" | "codex" | "hermes" | "openclaw";

type ProviderRuntimeConfig = {
  baseUrl: string;
  providerAccountId: string;
  secret: string;
};

type ProviderByokConfig = {
  providerAccountId: string;
  secret: string;
};

const providerEnvMap: Record<
  ProviderKey,
  { accountId: string; baseUrl: string; secret: string }
> = {
  "claude-code": {
    accountId: "CLAUDE_CODE_REAL_ACCOUNT_ID",
    baseUrl: "CLAUDE_CODE_BASE_URL",
    secret: "CLAUDE_CODE_REAL_SECRET"
  },
  codex: {
    accountId: "CODEX_REAL_ACCOUNT_ID",
    baseUrl: "CODEX_BASE_URL",
    secret: "CODEX_REAL_SECRET"
  },
  hermes: {
    accountId: "HERMES_REAL_ACCOUNT_ID",
    baseUrl: "HERMES_BASE_URL",
    secret: "HERMES_REAL_SECRET"
  },
  openclaw: {
    accountId: "OPENCLAW_REAL_ACCOUNT_ID",
    baseUrl: "OPENCLAW_BASE_URL",
    secret: "OPENCLAW_REAL_SECRET"
  }
};

const providerByokEnvMap: Record<
  ProviderKey,
  { accountId: string; secret: string }
> = {
  "claude-code": {
    accountId: "CLAUDE_CODE_E2E_ACCOUNT_ID",
    secret: "CLAUDE_CODE_E2E_SECRET"
  },
  codex: {
    accountId: "CODEX_E2E_ACCOUNT_ID",
    secret: "CODEX_E2E_SECRET"
  },
  hermes: {
    accountId: "HERMES_E2E_ACCOUNT_ID",
    secret: "HERMES_E2E_SECRET"
  },
  openclaw: {
    accountId: "OPENCLAW_E2E_ACCOUNT_ID",
    secret: "OPENCLAW_E2E_SECRET"
  }
};

export function isStagingRealProviderMode(): boolean {
  return process.env.AGENTHUB_REAL_PROVIDER_MODE === "staging";
}

export function getStagingProviderRuntimeConfig(provider: ProviderKey): ProviderRuntimeConfig {
  const mapping = providerEnvMap[provider];

  return {
    baseUrl: requireEnv(mapping.baseUrl),
    providerAccountId: requireEnv(mapping.accountId),
    secret: requireEnv(mapping.secret)
  };
}

export function getStagingByokCredential(provider: ProviderKey): ProviderByokConfig {
  const mapping = providerByokEnvMap[provider];

  return {
    providerAccountId: requireEnv(mapping.accountId),
    secret: requireEnv(mapping.secret)
  };
}

export function assertStagingProviderResult(result: {
  finalContent: string;
  streamEvents: Array<{ kind: string }>;
}): void {
  if (result.finalContent.trim().length === 0) {
    throw new Error("Expected real-provider acceptance to produce non-empty final content.");
  }

  if (result.streamEvents.length < 2) {
    throw new Error("Expected real-provider acceptance to emit at least two stream events.");
  }

  if (result.streamEvents[0]?.kind !== "conversation.message.started") {
    throw new Error("Expected the first stream event to be conversation.message.started.");
  }

  if (result.streamEvents.at(-1)?.kind !== "conversation.message.completed") {
    throw new Error("Expected the last stream event to be conversation.message.completed.");
  }
}

export function getRequiredStagingEnvironment(): string[] {
  return [
    ...getRequiredStagingByokEnvironment(),
    "AGENTHUB_LOAD_CONVERSATION_IDS",
    "AGENTHUB_LOAD_GROUP_CONVERSATION_IDS",
    "AGENTHUB_LOAD_STREAM_CONVERSATION_IDS",
    "HERMES_BASE_URL",
    "HERMES_REAL_ACCOUNT_ID",
    "HERMES_REAL_SECRET",
    "OPENCLAW_BASE_URL",
    "OPENCLAW_REAL_ACCOUNT_ID",
    "OPENCLAW_REAL_SECRET",
    "CODEX_BASE_URL",
    "CODEX_REAL_ACCOUNT_ID",
    "CODEX_REAL_SECRET",
    "CLAUDE_CODE_BASE_URL",
    "CLAUDE_CODE_REAL_ACCOUNT_ID",
    "CLAUDE_CODE_REAL_SECRET"
  ];
}

export function getRequiredStagingByokEnvironment(): string[] {
  return [
    "AGENTHUB_API_BASE_URL",
    "AGENTHUB_WEB_BASE_URL",
    "HERMES_E2E_ACCOUNT_ID",
    "HERMES_E2E_SECRET",
    "OPENCLAW_E2E_ACCOUNT_ID",
    "OPENCLAW_E2E_SECRET",
    "CODEX_E2E_ACCOUNT_ID",
    "CODEX_E2E_SECRET",
    "CLAUDE_CODE_E2E_ACCOUNT_ID",
    "CLAUDE_CODE_E2E_SECRET"
  ];
}

function requireEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required staging environment variable: ${name}`);
  }

  return value;
}
