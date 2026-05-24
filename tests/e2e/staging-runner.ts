import { spawn } from "node:child_process";

import { getRequiredStagingEnvironment } from "./real-provider-test-support.js";

const loadScenarios = [
  "tests/load/session-list.js",
  "tests/load/send-message.js",
  "tests/load/group-orchestration.js",
  "tests/load/stream-stability.js"
];

async function main(): Promise<void> {
  if (process.env.AGENTHUB_STAGING_DRY_RUN === "1") {
    printDryRun();
    return;
  }

  const missing = getRequiredStagingEnvironment().filter((name) => !process.env[name]);

  if (missing.length > 0) {
    throw new Error(
      `Missing staging environment variables:\n- ${missing.join("\n- ")}`
    );
  }

  await runCommand("pnpm", ["test:e2e:byok:staging"], process.env);
  await runCommand("pnpm", ["test:e2e:providers"], {
    ...process.env,
    AGENTHUB_REAL_PROVIDER_MODE: "staging"
  });

  for (const scenario of loadScenarios) {
    await runCommand("k6", ["run", scenario], process.env);
  }
}

function printDryRun(): void {
  process.stdout.write("Staging acceptance dry run\n");
  process.stdout.write("Required environment variables:\n");
  for (const name of getRequiredStagingEnvironment()) {
    process.stdout.write(`- ${name}\n`);
  }
  process.stdout.write("\nCommands:\n");
  process.stdout.write("- pnpm test:e2e:byok:staging\n");
  process.stdout.write("- AGENTHUB_REAL_PROVIDER_MODE=staging pnpm test:e2e:providers\n");
  for (const scenario of loadScenarios) {
    process.stdout.write(`- k6 run ${scenario}\n`);
  }
}

function runCommand(
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env,
      stdio: "inherit"
    });

    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} ${args.join(" ")} failed with exit code ${code ?? -1}`));
    });
    child.on("error", reject);
  });
}

void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
