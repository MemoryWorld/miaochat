export type SetupProvider = "claude-code" | "codex" | "hermes" | "openclaw";

export type ProviderCatalogEntry = {
  description: string;
  id: SetupProvider;
  labelHint: string;
  name: string;
  secretHint: string;
};

export const defaultWorkspaceId = "default-workspace";

export const providerCatalog: ProviderCatalogEntry[] = [
  {
    description: "Best when the team already uses OpenAI tooling and wants a predictable key format.",
    id: "codex",
    labelHint: "Codex primary workspace key",
    name: "Codex",
    secretHint: "Expected prefix: openai_ or sk-"
  },
  {
    description: "Fast path for Claude Code seats with Anthropic-style credentials and longer context work.",
    id: "claude-code",
    labelHint: "Claude Code main seat",
    name: "Claude Code",
    secretHint: "Expected prefix: anthropic_, claude_, or sk-ant-"
  },
  {
    description: "Provider profile for Hermes-based execution stacks and internal engineering copilots.",
    id: "hermes",
    labelHint: "Hermes engineering key",
    name: "Hermes",
    secretHint: "Expected prefix: hermes_"
  },
  {
    description: "Provider profile for OpenClaw command-line or orchestration-heavy agent environments.",
    id: "openclaw",
    labelHint: "OpenClaw operator key",
    name: "OpenClaw",
    secretHint: "Expected prefix: openclaw_"
  }
];

export function getProviderById(id: SetupProvider): ProviderCatalogEntry {
  const provider = providerCatalog.find((entry) => entry.id === id);
  if (!provider) {
    throw new Error(`Unknown provider: ${id}`);
  }

  return provider;
}
