type CleanupResult = {
  failed: Array<{
    detail: string;
    name: string;
    provider: "fly" | "s3" | "vercel";
  }>;
  manual: Array<{
    detail: string;
    name: string;
    provider: "s3";
  }>;
  removed: Array<{
    name: string;
    provider: "fly" | "vercel";
  }>;
};

async function main(): Promise<void> {
  const result = await cleanupRealDeploys();
  process.stdout.write(formatCleanupReport(result));

  if (result.failed.length > 0) {
    process.exitCode = 1;
  }
}

async function cleanupRealDeploys(): Promise<CleanupResult> {
  const vercelProjects = readCsvEnv("MIAOCHAT_DEPLOY_CLEANUP_VERCEL_PROJECTS");
  const flyApps = readCsvEnv("MIAOCHAT_DEPLOY_CLEANUP_FLY_APPS");
  const s3Keys = readCsvEnv("MIAOCHAT_DEPLOY_CLEANUP_S3_KEYS");
  const result: CleanupResult = {
    failed: [],
    manual: [],
    removed: []
  };

  for (const project of vercelProjects) {
    const token = readOptionalEnv("VERCEL_TOKEN");
    if (!token) {
      result.failed.push({
        detail: "Missing VERCEL_TOKEN.",
        name: project,
        provider: "vercel"
      });
      continue;
    }

    const response = await fetch(buildVercelProjectDeleteUrl(project), {
      headers: {
        Authorization: `Bearer ${token}`
      },
      method: "DELETE"
    });

    if (response.ok || response.status === 404) {
      result.removed.push({
        name: project,
        provider: "vercel"
      });
      continue;
    }

    result.failed.push({
      detail: `HTTP ${response.status}: ${await response.text()}`,
      name: project,
      provider: "vercel"
    });
  }

  for (const app of flyApps) {
    const token = readOptionalEnv("FLY_API_TOKEN");
    if (!token) {
      result.failed.push({
        detail: "Missing FLY_API_TOKEN.",
        name: app,
        provider: "fly"
      });
      continue;
    }

    const response = await fetch(
      `https://api.machines.dev/v1/apps/${encodeURIComponent(app)}`,
      {
        headers: {
          Authorization: `Bearer ${token}`
        },
        method: "DELETE"
      }
    );

    if (response.ok || response.status === 404) {
      result.removed.push({
        name: app,
        provider: "fly"
      });
      continue;
    }

    result.failed.push({
      detail: `HTTP ${response.status}: ${await response.text()}`,
      name: app,
      provider: "fly"
    });
  }

  for (const key of s3Keys) {
    result.manual.push({
      detail:
        "Delete this object from the public source-archive bucket or keep it as acceptance evidence.",
      name: key,
      provider: "s3"
    });
  }

  return result;
}

function formatCleanupReport(result: CleanupResult): string {
  const lines = ["# Real Deploy Cleanup", ""];

  lines.push(`Removed: ${result.removed.length}`);
  for (const entry of result.removed) {
    lines.push(`- ${entry.provider}: ${entry.name}`);
  }

  if (result.manual.length > 0) {
    lines.push("", "Manual S3/R2 cleanup:");
    for (const entry of result.manual) {
      lines.push(`- ${entry.name}: ${entry.detail}`);
    }
  }

  if (result.failed.length > 0) {
    lines.push("", "Failed:");
    for (const entry of result.failed) {
      lines.push(`- ${entry.provider} ${entry.name}: ${entry.detail}`);
    }
  }

  lines.push("");
  return lines.join("\n");
}

function buildVercelProjectDeleteUrl(project: string): string {
  const url = new URL(
    `/v9/projects/${encodeURIComponent(project)}`,
    "https://api.vercel.com"
  );
  const teamId = readOptionalEnv("VERCEL_TEAM_ID");

  if (teamId) {
    url.searchParams.set("teamId", teamId);
  }

  return url.toString();
}

function readCsvEnv(name: string): string[] {
  return (process.env[name] ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function readOptionalEnv(name: string): string | null {
  return process.env[name]?.trim() || null;
}

void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
