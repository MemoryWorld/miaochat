import {
  formatPhaseADemoCheckReport,
  readPhaseADemoEnvironment,
  runPhaseADemoCheck
} from "./phase-a-support.js";

async function main(): Promise<void> {
  const environment = readPhaseADemoEnvironment(process.env);
  const result = await runPhaseADemoCheck(environment);

  console.log(formatPhaseADemoCheckReport(result));

  if (!result.readyForSeed) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
