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
  const result = await runGitDiff(input.cwd);

  if (result.exitCode !== 0) {
    return null;
  }

  const patch = result.stdout.trim();

  if (patch.length === 0) {
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

function runGitDiff(cwd: string): Promise<{
  exitCode: number;
  stdout: string;
}> {
  return new Promise((resolve) => {
    const child = spawn("git", ["diff", "--no-ext-diff", "--", "."], {
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
