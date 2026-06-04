import { execFile } from "node:child_process";
import { access, mkdtemp, readFile, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

import { createAgentRunSandbox } from "../src/shared/agent-run-sandbox.js";
import { captureWorkspaceDiff } from "../src/shared/workspace-diff.js";

const execFileAsync = promisify(execFile);
const tempDirectories: string[] = [];

describe("agent run sandbox", () => {
  afterEach(async () => {
    for (const directory of tempDirectories.splice(0)) {
      await rm(directory, {
        force: true,
        recursive: true
      });
    }
  });

  it("captures edits from an isolated git worktree without mutating the source repo", async () => {
    const cwd = await createGitRepo();
    const sandbox = await createAgentRunSandbox({
      cwd,
      provider: "codex"
    });

    try {
      expect(sandbox.metadata.strategy).toBe("git_worktree");
      expect(sandbox.cwd).not.toBe(cwd);

      await writeFile(
        join(sandbox.cwd, "app.ts"),
        "export const value = sandbox;\n",
        "utf8"
      );

      await expect(readFile(join(cwd, "app.ts"), "utf8")).resolves.toBe(
        "export const value = source;\n"
      );

      const draft = await captureWorkspaceDiff({
        cwd: sandbox.diffCwd,
        fileName: "codex-runtime.diff",
        title: "Codex 代码 Diff"
      });

      expect(draft?.patch).toContain("-export const value = source;");
      expect(draft?.patch).toContain("+export const value = sandbox;");
    } finally {
      await sandbox.cleanup();
    }

    await expect(access(sandbox.metadata.workspaceRoot)).rejects.toThrow();
  });

  it("contains destructive deletes inside the sandbox worktree", async () => {
    const cwd = await createGitRepo();
    const sandbox = await createAgentRunSandbox({
      cwd,
      provider: "claude-code"
    });

    try {
      await unlink(join(sandbox.cwd, "app.ts"));

      await expect(readFile(join(cwd, "app.ts"), "utf8")).resolves.toBe(
        "export const value = source;\n"
      );

      const draft = await captureWorkspaceDiff({
        cwd: sandbox.diffCwd,
        fileName: "claude-code-runtime.diff",
        title: "Claude Code 代码 Diff"
      });

      expect(draft?.patch).toContain("deleted file mode");
      expect(draft?.patch).toContain("-export const value = source;");
    } finally {
      await sandbox.cleanup();
    }
  });

  it("can be explicitly disabled for direct legacy execution", async () => {
    const cwd = await createGitRepo();
    const sandbox = await createAgentRunSandbox({
      cwd,
      enabled: false,
      provider: "codex"
    });

    expect(sandbox.metadata.strategy).toBe("direct");
    expect(sandbox.cwd).toBe(cwd);
    await sandbox.cleanup();
  });
});

async function createGitRepo(): Promise<string> {
  const cwd = await mkdtemp(join(tmpdir(), "miaochat-agent-sandbox-test-"));
  tempDirectories.push(cwd);

  await git(cwd, "init");
  await git(cwd, "config", "user.email", "miaochat@example.com");
  await git(cwd, "config", "user.name", "Miaochat Test");
  await writeFile(join(cwd, "app.ts"), "export const value = source;\n", "utf8");
  await git(cwd, "add", "app.ts");
  await git(cwd, "commit", "-m", "initial");

  return cwd;
}

async function git(cwd: string, ...args: string[]): Promise<void> {
  await execFileAsync("git", args, { cwd });
}
