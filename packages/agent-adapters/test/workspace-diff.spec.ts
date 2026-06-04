import { execFile } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

import { captureWorkspaceDiff } from "../src/shared/workspace-diff.js";

const execFileAsync = promisify(execFile);

describe("workspace diff capture", () => {
  it("returns a runtime diff artifact draft for tracked file edits", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "miaochat-agent-diff-"));
    const filePath = join(cwd, "app.ts");

    await git(cwd, "init");
    await git(cwd, "config", "user.email", "miaochat@example.com");
    await git(cwd, "config", "user.name", "Miaochat Test");
    await writeFile(filePath, "export const value = 'old';\n", "utf8");
    await git(cwd, "add", "app.ts");
    await git(cwd, "commit", "-m", "initial");
    await writeFile(filePath, "export const value = 'new';\n", "utf8");

    const draft = await captureWorkspaceDiff({
      cwd,
      fileName: "codex-runtime.diff",
      title: "Codex 代码 Diff"
    });

    expect(draft).toEqual(
      expect.objectContaining({
        fileName: "codex-runtime.diff",
        mimeType: "text/x-diff",
        title: "Codex 代码 Diff",
        truncated: false,
        type: "diff"
      })
    );
    expect(draft?.patch).toContain("-export const value = 'old';");
    expect(draft?.patch).toContain("+export const value = 'new';");
  });

  it("includes untracked files as synthetic new-file diffs", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "miaochat-agent-diff-"));
    const trackedFilePath = join(cwd, "app.ts");
    const untrackedFilePath = join(cwd, "created.ts");

    await git(cwd, "init");
    await git(cwd, "config", "user.email", "miaochat@example.com");
    await git(cwd, "config", "user.name", "Miaochat Test");
    await writeFile(trackedFilePath, "export const value = 'old';\n", "utf8");
    await git(cwd, "add", "app.ts");
    await git(cwd, "commit", "-m", "initial");
    await writeFile(untrackedFilePath, "export const created = true;\n", "utf8");

    const draft = await captureWorkspaceDiff({
      cwd,
      fileName: "claude-code-runtime.diff",
      title: "Claude Code 代码 Diff"
    });

    expect(draft).toEqual(
      expect.objectContaining({
        fileName: "claude-code-runtime.diff",
        mimeType: "text/x-diff",
        title: "Claude Code 代码 Diff",
        truncated: false,
        type: "diff"
      })
    );
    expect(draft?.patch).toContain("new file mode");
    expect(draft?.patch).toContain("+++ b/created.ts");
    expect(draft?.patch).toContain("+export const created = true;");
  });
});

async function git(cwd: string, ...args: string[]): Promise<void> {
  await execFileAsync("git", args, { cwd });
}
