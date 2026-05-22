import type { DeployCommandResult } from "@agenthub/contracts";

export type ParsedDeployCommand = {
  targetName: string;
};

export type { DeployCommandResult };

export function parseDeployCommand(content: string): ParsedDeployCommand | null {
  const trimmed = content.trim();
  const match = /^\/deploy(?:\s+(.+))$/i.exec(trimmed);
  const targetName = match?.[1]?.trim();

  if (!targetName) {
    return null;
  }

  return {
    targetName
  };
}
