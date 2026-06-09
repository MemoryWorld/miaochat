import {
  formatDeployAcceptanceReport,
  getMissingDeployAcceptanceVariables,
  readDeployAcceptanceEnvironment,
  runRealDeployAcceptance
} from "./support.js";

async function main(): Promise<void> {
  const environment = readDeployAcceptanceEnvironment();
  const missing = getMissingDeployAcceptanceVariables(environment);

  if (missing.length > 0) {
    process.stdout.write("Real deploy acceptance: BLOCKED\n");
    process.stdout.write(`Missing environment variables: ${missing.join(", ")}\n`);
    process.stdout.write(
      "Start API and worker with the same S3/R2 environment before rerunning this command.\n"
    );
    process.exitCode = 1;
    return;
  }

  const result = await runRealDeployAcceptance({
    environment
  });
  process.stdout.write(`${formatDeployAcceptanceReport(result)}\n`);
}

void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
