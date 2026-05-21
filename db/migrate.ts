import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import { Client } from "pg";

async function run(): Promise<void> {
  const client = new Client({
    connectionString:
      process.env.DATABASE_URL ?? "postgres://agenthub:agenthub@localhost:5432/agenthub"
  });

  await client.connect();

  try {
    const migrationsDir = join(process.cwd(), "db", "migrations");
    const files = (await readdir(migrationsDir))
      .filter((file) => file.endsWith(".sql"))
      .sort();

    for (const file of files) {
      const sql = await readFile(join(migrationsDir, file), "utf8");
      await client.query(sql);
    }
  } finally {
    await client.end();
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
