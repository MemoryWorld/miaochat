import { execFileSync } from "node:child_process";

import {
  evaluateStagingAcceptanceReadiness,
  getExpectedStagingSecretNames,
  parseGitHubRepoSlug,
  STAGING_ENVIRONMENT_NAME,
  STAGING_WORKFLOW_FILE
} from "./support.js";

async function main(): Promise<void> {
  const repository = process.env.AGENTHUB_GITHUB_REPO ?? detectRepository();
  const workflowAvailableOnDefaultBranch = checkWorkflow(repository);
  const environmentExists = checkEnvironment(repository);
  const presentSecrets = environmentExists ? listEnvironmentSecrets(repository) : [];
  const readiness = evaluateStagingAcceptanceReadiness({
    environmentExists,
    expectedSecrets: getExpectedStagingSecretNames(),
    presentSecrets,
    workflowAvailableOnDefaultBranch
  });

  process.stdout.write(`Repository: ${repository}\n`);
  process.stdout.write(`Environment: ${STAGING_ENVIRONMENT_NAME}\n`);
  process.stdout.write(
    `Workflow on default branch: ${workflowAvailableOnDefaultBranch ? "yes" : "no"}\n`
  );
  process.stdout.write(`Environment exists: ${environmentExists ? "yes" : "no"}\n`);
  process.stdout.write(
    `Present secrets: ${presentSecrets.length}/${getExpectedStagingSecretNames().length}\n`
  );

  if (readiness.issues.length === 0) {
    process.stdout.write("Staging acceptance preflight: READY\n");
    return;
  }

  process.stdout.write("Staging acceptance preflight: BLOCKED\n");
  for (const issue of readiness.issues) {
    process.stdout.write(`- ${issue}\n`);
  }

  if (!environmentExists) {
    process.stdout.write(
      `Create the environment with:\n  gh api --method PUT repos/${repository}/environments/${STAGING_ENVIRONMENT_NAME}\n`
    );
  }

  if (!workflowAvailableOnDefaultBranch) {
    process.stdout.write(
      `Push and merge a branch that contains .github/workflows/${STAGING_WORKFLOW_FILE} into the default branch.\n`
    );
  }

  if (readiness.missingSecrets.length > 0) {
    process.stdout.write("Populate the missing staging secrets with:\n");
    for (const name of readiness.missingSecrets) {
      process.stdout.write(`  gh secret set --env ${STAGING_ENVIRONMENT_NAME} ${name} -R ${repository}\n`);
    }
  }

  process.exitCode = 1;
}

function detectRepository(): string {
  const originUrl = runGhFreeCommand("git", ["-C", process.cwd(), "config", "--get", "remote.origin.url"]);
  return parseGitHubRepoSlug(originUrl);
}

function checkWorkflow(repository: string): boolean {
  try {
    runGhCommand([
      "api",
      `repos/${repository}/actions/workflows/${STAGING_WORKFLOW_FILE}`
    ]);
    return true;
  } catch {
    return false;
  }
}

function checkEnvironment(repository: string): boolean {
  try {
    runGhCommand(["api", `repos/${repository}/environments/${STAGING_ENVIRONMENT_NAME}`]);
    return true;
  } catch {
    return false;
  }
}

function listEnvironmentSecrets(repository: string): string[] {
  const output = runGhCommand([
    "secret",
    "list",
    "--env",
    STAGING_ENVIRONMENT_NAME,
    "-R",
    repository,
    "--json",
    "name"
  ]);

  return (JSON.parse(output) as Array<{ name: string }>).map((entry) => entry.name);
}

function runGhCommand(args: string[]): string {
  return execFileSync("gh", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  }).trim();
}

function runGhFreeCommand(command: string, args: string[]): string {
  return execFileSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  }).trim();
}

void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
