import { spawn } from "node:child_process";

import {
  runtimeDiffArtifactMaxPatchChars,
  runtimeDiffArtifactDraftSchema,
  type RuntimeDiffArtifactDraft
} from "@agenthub/contracts";

export async function captureWorkspaceDiff(input: {
  cwd: string;
  fileName: string;
  title: string;
}): Promise<RuntimeDiffArtifactDraft | null> {
  const collectedPatch = await collectWorkspaceDiff(input.cwd);

  if (!collectedPatch) {
    return null;
  }

  const patch = collectedPatch.trim();

  if (!patch) {
    return null;
  }

  const truncated = patch.length > runtimeDiffArtifactMaxPatchChars;
  const draft = runtimeDiffArtifactDraftSchema.safeParse({
    fileName: input.fileName,
    mimeType: "text/x-diff",
    patch: truncated ? patch.slice(0, runtimeDiffArtifactMaxPatchChars) : patch,
    title: input.title,
    truncated,
    type: "diff"
  });

  return draft.success ? draft.data : null;
}

async function collectWorkspaceDiff(cwd: string): Promise<string | null> {
  const trackedDiff = await runGit(cwd, ["diff", "--no-ext-diff", "--", "."]);

  if (trackedDiff.exitCode !== 0) {
    return null;
  }

  const patches = compactPatches([trackedDiff.stdout]);
  const untrackedFiles = await listUntrackedFiles(cwd);

  for (const file of untrackedFiles) {
    const untrackedDiff = await runGit(cwd, [
      "diff",
      "--no-ext-diff",
      "--no-index",
      "--",
      "/dev/null",
      file
    ]);

    if (
      (untrackedDiff.exitCode === 0 || untrackedDiff.exitCode === 1) &&
      untrackedDiff.stdout.trim()
    ) {
      patches.push(untrackedDiff.stdout.trim());
    }
  }

  return patches.length > 0 ? patches.join("\n\n") : null;
}

async function listUntrackedFiles(cwd: string): Promise<string[]> {
  const result = await runGit(cwd, [
    "ls-files",
    "--others",
    "--exclude-standard",
    "-z",
    "--",
    "."
  ]);

  if (result.exitCode !== 0 || !result.stdout) {
    return [];
  }

  return result.stdout.split("\0").filter(Boolean);
}

function compactPatches(patches: string[]): string[] {
  return patches.map((patch) => patch.trim()).filter(Boolean);
}

function runGit(cwd: string, args: string[]): Promise<{
  exitCode: number;
  stdout: string;
}> {
  return new Promise((resolve) => {
    const child = spawn("git", args, {
      cwd,
      stdio: ["ignore", "pipe", "ignore"]
    });
    const stdout: Buffer[] = [];

    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.on("error", () => {
      resolve({
        exitCode: 127,
        stdout: ""
      });
    });
    child.on("close", (exitCode) => {
      resolve({
        exitCode: exitCode ?? 1,
        stdout: Buffer.concat(stdout).toString("utf8")
      });
    });
  });
}
