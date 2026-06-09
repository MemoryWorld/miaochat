import {
  authenticateDeployAcceptanceUser,
  getMissingDeployAcceptanceVariables,
  readDeployAcceptanceEnvironment,
  seedRealDeployTargets
} from "./support.js";

async function main(): Promise<void> {
  const environment = readDeployAcceptanceEnvironment();
  const missing = getMissingDeployAcceptanceVariables(environment);

  if (missing.length > 0) {
    process.stdout.write("Real deploy target seed: BLOCKED\n");
    process.stdout.write(`Missing environment variables: ${missing.join(", ")}\n`);
    process.exitCode = 1;
    return;
  }

  const session = await authenticateDeployAcceptanceUser(environment);
  const targets = await seedRealDeployTargets({
    environment,
    session
  });

  process.stdout.write("Real deploy target seed: CREATED\n");
  process.stdout.write(`Run ID: ${environment.runId}\n`);
  process.stdout.write(`User: ${environment.userEmail}\n`);
  process.stdout.write(`Workspace: ${environment.workspaceId}\n`);
  for (const target of targets) {
    process.stdout.write(
      `- ${target.kind}: ${target.name}${target.providerResourceName ? ` (${target.providerResourceName})` : ""}\n`
    );
  }
}

void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
