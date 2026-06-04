import { basename } from "node:path";

const blockedCommands = new Set([
  "chmod",
  "chown",
  "curl",
  "dd",
  "mkfs",
  "mkfs.ext4",
  "mount",
  "pkill",
  "powershell",
  "pwsh",
  "rm",
  "sudo",
  "umount",
  "wget"
]);

const shellCommands = new Set([
  "bash",
  "csh",
  "fish",
  "sh",
  "zsh"
]);

const shellMetaPattern = /(?:^|\s)(?:curl|wget)\b[\s\S]*(?:\||&&|;)[\s\S]*\b(?:bash|sh|zsh|fish|pwsh|powershell)\b|\b(?:rm\s+-[a-zA-Z]*r[a-zA-Z]*f|rm\s+-[a-zA-Z]*f[a-zA-Z]*r)\b|(?:^|\s)sudo\b/i;
const destructivePathPattern = /(?:^|\s)(?:\/|~|\.\.)(?:\s|$)/;

export type CommandPolicyInput = {
  args?: string[];
  command: string;
};

export type CommandPolicyViolation = {
  command: string;
  reason: string;
};

export class CommandPolicyError extends Error {
  readonly violation: CommandPolicyViolation;

  constructor(violation: CommandPolicyViolation) {
    super(`Command "${violation.command}" is not allowed: ${violation.reason}.`);
    this.name = "CommandPolicyError";
    this.violation = violation;
  }
}

export function assertCommandPolicyAllowed(input: CommandPolicyInput): void {
  const violation = assessCommandPolicy(input);

  if (violation) {
    throw new CommandPolicyError(violation);
  }
}

export function assessCommandPolicy(
  input: CommandPolicyInput
): CommandPolicyViolation | null {
  const command = normalizeCommand(input.command);
  const args = input.args ?? [];
  const commandLine = [command, ...args].join(" ");

  if (blockedCommands.has(command)) {
    return {
      command: input.command,
      reason: `blocked command family ${command}`
    };
  }

  if (shellCommands.has(command)) {
    const script = extractShellScript(args);

    if (!script) {
      return {
        command: input.command,
        reason: "interactive shell entrypoints are not allowed"
      };
    }

    if (shellMetaPattern.test(script) || destructivePathPattern.test(script)) {
      return {
        command: input.command,
        reason: "shell script contains destructive or bootstrap execution syntax"
      };
    }
  }

  if (shellMetaPattern.test(commandLine)) {
    return {
      command: input.command,
      reason: "command line contains destructive or bootstrap execution syntax"
    };
  }

  return null;
}

function normalizeCommand(command: string): string {
  const trimmed = command.trim();
  return basename(trimmed).toLowerCase();
}

function extractShellScript(args: string[]): string | null {
  const commandIndex = args.findIndex((arg) => arg === "-c" || arg === "--command");

  if (commandIndex < 0) {
    return null;
  }

  return args[commandIndex + 1] ?? "";
}
