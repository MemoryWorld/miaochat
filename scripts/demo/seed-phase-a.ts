import { Client } from "pg";

import {
  createPgPhaseADemoStore,
  formatPhaseADemoSeedReport,
  seedPhaseADemoData
} from "./seed-phase-a-lib.js";
import { readPhaseADemoEnvironment } from "./phase-a-support.js";

async function main(): Promise<void> {
  const environment = readPhaseADemoEnvironment(process.env);
  const client = new Client({
    connectionString: environment.databaseUrl
  });

  await client.connect();

  try {
    await client.query("BEGIN");
    const result = await seedPhaseADemoData(createPgPhaseADemoStore(client), environment);
    await client.query("COMMIT");
    console.log(formatPhaseADemoSeedReport(result));
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
