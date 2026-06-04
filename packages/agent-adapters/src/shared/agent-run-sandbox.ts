import { execFile } from "node:child_process";
import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, isAbsolute, join, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";

import { AgentAdapterError } from "@agenthub/agent-sdk";

const execFileAsync = promisify(execFile);
const tempSandboxPrefix = "miaochat-agent-sandbox-";
const copyExcludes = new Set([
  ".git",
  ".next",
  ".turbo",
  "coverage",
  "dist",
  "node_modules"
]);

export type AgentRunSandboxStrategy = "direct" | "filesystem_copy" | "git_worktree";

export type AgentRunContainerRuntime = "docker" | "podman";

export type AgentRunOsIsolationMode = "off" | "preferred" | "required";

export type AgentRunOsIsolationStatus =
  | "available"
  | "not_required"
  | "unavailable_allowed";

export type AgentRunOsIsolationMetadata = {
  mode: AgentRunOsIsolationMode;
  runtime: AgentRunContainerRuntime | null;
  status: AgentRunOsIsolationStatus;
};

export type CommandAvailabilityCheck = (
  command: AgentRunContainerRuntime
) => Promise<boolean>;

export type AgentRunSandboxMetadata = {
  createdAt: string;
  osIsolation: AgentRunOsIsolationMetadata;
  originalCwd: string;
  provider: string;
  strategy: AgentRunSandboxStrategy;
  workspaceRoot: string;
  workingCwd: string;
};

export type AgentRunSandbox = {
  cleanup(): Promise<void>;
  cwd: string;
  diffCwd: string;
  metadata: AgentRunSandboxMetadata;
};

export type CreateAgentRunSandboxInput = {
  commandAvailable?: CommandAvailabilityCheck;
  containerRuntime?: AgentRunContainerRuntime;
  cwd: string;
  enabled?: boolean;
  osIsolationMode?: AgentRunOsIsolationMode;
  provider: string;
};

export async function createAgentRunSandbox(
  input: CreateAgentRunSandboxInput
): Promise<AgentRunSandbox> {
  const originalCwd = resolve(input.cwd);
  const osIsolation = await resolveAgentRunOsIsolation({
    commandAvailable: input.commandAvailable ?? commandAvailable,
    mode:
      input.osIsolationMode ??
      parseOsIsolationMode(process.env.MIAOCHAT_AGENT_OS_SANDBOX),
    runtime:
      input.containerRuntime ??
      parseContainerRuntime(process.env.MIAOCHAT_AGENT_CONTAINER_RUNTIME)
  });

  if (!isAgentRunSandboxEnabled(input.enabled)) {
    return createDirectSandbox(input.provider, originalCwd, osIsolation);
  }

  const tempRoot = await mkdtemp(join(tmpdir(), tempSandboxPrefix));

  try {
    return await createGitWorktreeSandbox({
      originalCwd,
      osIsolation,
      provider: input.provider,
      tempRoot
    });
  } catch (gitWorktreeError) {
    try {
      return await createFilesystemCopySandbox({
        originalCwd,
        osIsolation,
        provider: input.provider,
        tempRoot
      });
    } catch (copyError) {
      await safeRemoveTempRoot(tempRoot);
      throw new AgentAdapterError(
        `Agent workspace sandbox failed. git_worktree=${formatErrorMessage(
          gitWorktreeError
        )}; filesystem_copy=${formatErrorMessage(copyError)}`,
        { code: "workspace_sandbox_failed" }
      );
    }
  }
}

export function isAgentRunSandboxEnabled(enabled: boolean | undefined): boolean {
  if (enabled !== undefined) {
    return enabled;
  }

  return !/^(0|false|no|off|disabled)$/i.test(
    process.env.MIAOCHAT_AGENT_WORKSPACE_SANDBOX ?? ""
  );
}

function createDirectSandbox(
  provider: string,
  originalCwd: string,
  osIsolation: AgentRunOsIsolationMetadata
): AgentRunSandbox {
  const metadata = createMetadata({
    osIsolation,
    originalCwd,
    provider,
    strategy: "direct",
    workspaceRoot: originalCwd,
    workingCwd: originalCwd
  });

  return {
    cleanup: async () => undefined,
    cwd: originalCwd,
    diffCwd: originalCwd,
    metadata
  };
}

async function createGitWorktreeSandbox(input: {
  osIsolation: AgentRunOsIsolationMetadata;
  originalCwd: string;
  provider: string;
  tempRoot: string;
}): Promise<AgentRunSandbox> {
  const gitRoot = (await git(input.originalCwd, ["rev-parse", "--show-toplevel"]))
    .stdout.trim();
  const relativeCwd = safeRelative(gitRoot, input.originalCwd);
  const workspaceRoot = join(input.tempRoot, "workspace");

  await git(gitRoot, ["worktree", "add", "--detach", workspaceRoot, "HEAD"]);

  const workingCwd = relativeCwd ? join(workspaceRoot, relativeCwd) : workspaceRoot;
  const metadata = createMetadata({
    osIsolation: input.osIsolation,
    originalCwd: input.originalCwd,
    provider: input.provider,
    strategy: "git_worktree",
    workspaceRoot,
    workingCwd
  });

  return {
    cleanup: async () => {
      await git(gitRoot, ["worktree", "remove", "--force", workspaceRoot]).catch(
        () => undefined
      );
      await git(gitRoot, ["worktree", "prune"]).catch(() => undefined);
      await safeRemoveTempRoot(input.tempRoot);
    },
    cwd: workingCwd,
    diffCwd: workspaceRoot,
    metadata
  };
}

async function createFilesystemCopySandbox(input: {
  osIsolation: AgentRunOsIsolationMetadata;
  originalCwd: string;
  provider: string;
  tempRoot: string;
}): Promise<AgentRunSandbox> {
  const workspaceRoot = join(input.tempRoot, "workspace");

  await cp(input.originalCwd, workspaceRoot, {
    dereference: false,
    filter: (source) => shouldCopyPath(input.originalCwd, source),
    recursive: true
  });
  await git(workspaceRoot, ["init"]);
  await git(workspaceRoot, ["config", "user.email", "sandbox@miaochat.local"]);
  await git(workspaceRoot, ["config", "user.name", "MiaoChat Sandbox"]);
  await git(workspaceRoot, ["add", "."]);
  await git(workspaceRoot, ["commit", "--allow-empty", "-m", "sandbox baseline"]);

  const metadata = createMetadata({
    osIsolation: input.osIsolation,
    originalCwd: input.originalCwd,
    provider: input.provider,
    strategy: "filesystem_copy",
    workspaceRoot,
    workingCwd: workspaceRoot
  });

  return {
    cleanup: async () => safeRemoveTempRoot(input.tempRoot),
    cwd: workspaceRoot,
    diffCwd: workspaceRoot,
    metadata
  };
}

function shouldCopyPath(sourceRoot: string, source: string): boolean {
  const relativeSource = relative(sourceRoot, source);

  if (!relativeSource) {
    return true;
  }

  const parts = relativeSource.split(/[\\/]/);
  return !parts.some((part) => copyExcludes.has(part));
}

function createMetadata(input: Omit<AgentRunSandboxMetadata, "createdAt">): AgentRunSandboxMetadata {
  return {
    ...input,
    createdAt: new Date().toISOString()
  };
}

function safeRelative(root: string, child: string): string {
  const relativePath = relative(root, child);

  if (
    relativePath === ".." ||
    relativePath.startsWith(`..${sep}`) ||
    isAbsolute(relativePath)
  ) {
    throw new Error(`Sandbox cwd ${child} is outside git root ${root}.`);
  }

  return relativePath;
}

async function resolveAgentRunOsIsolation(input: {
  commandAvailable: CommandAvailabilityCheck;
  mode: AgentRunOsIsolationMode;
  runtime: AgentRunContainerRuntime | null;
}): Promise<AgentRunOsIsolationMetadata> {
  if (input.mode === "off") {
    return {
      mode: "off",
      runtime: null,
      status: "not_required"
    };
  }

  const runtimeCandidates: AgentRunContainerRuntime[] = input.runtime
    ? [input.runtime]
    : ["docker", "podman"];

  for (const runtime of runtimeCandidates) {
    if (await input.commandAvailable(runtime)) {
      return {
        mode: input.mode,
        runtime,
        status: "available"
      };
    }
  }

  if (input.mode === "required") {
    throw new AgentAdapterError(
      "Agent OS sandbox isolation is required, but Docker or Podman is not available.",
      { code: "os_sandbox_unavailable" }
    );
  }

  return {
    mode: "preferred",
    runtime: null,
    status: "unavailable_allowed"
  };
}

async function commandAvailable(command: AgentRunContainerRuntime): Promise<boolean> {
  try {
    await execFileAsync(command, ["--version"], {
      maxBuffer: 1024 * 1024
    });
    return true;
  } catch {
    return false;
  }
}

function parseOsIsolationMode(
  value: string | undefined
): AgentRunOsIsolationMode {
  if (/^(required|require)$/i.test(value ?? "")) {
    return "required";
  }

  if (/^(1|true|yes|on|preferred|prefer)$/i.test(value ?? "")) {
    return "preferred";
  }

  return "off";
}

function parseContainerRuntime(
  value: string | undefined
): AgentRunContainerRuntime | null {
  if (/^docker$/i.test(value ?? "")) {
    return "docker";
  }

  if (/^podman$/i.test(value ?? "")) {
    return "podman";
  }

  return null;
}

async function safeRemoveTempRoot(tempRoot: string): Promise<void> {
  const resolvedTempRoot = resolve(tempRoot);
  const resolvedSystemTemp = resolve(tmpdir());

  if (
    basename(resolvedTempRoot).startsWith(tempSandboxPrefix) &&
    resolvedTempRoot.startsWith(`${resolvedSystemTemp}${sep}`)
  ) {
    await rm(resolvedTempRoot, {
      force: true,
      maxRetries: 2,
      recursive: true
    });
  }
}

async function git(cwd: string, args: string[]): Promise<{ stderr: string; stdout: string }> {
  const result = await execFileAsync("git", args, {
    cwd,
    maxBuffer: 10 * 1024 * 1024
  });

  return {
    stderr: String(result.stderr),
    stdout: String(result.stdout)
  };
}

function formatErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
