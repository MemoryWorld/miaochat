import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import { Client, DatabaseError } from "pg";

import { loadLocalEnvFiles } from "./env.js";

const duplicateErrorCodes = new Set([
  "42701", // duplicate_column
  "42710", // duplicate_object
  "42P07"  // duplicate_table / relation already exists
]);

async function run(): Promise<void> {
  loadLocalEnvFiles();

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
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    for (const file of files) {
      const alreadyApplied = await client.query<{ filename: string }>(
        `
          SELECT filename
          FROM schema_migrations
          WHERE filename = $1
        `,
        [file]
      );

      if (alreadyApplied.rows[0]) {
        continue;
      }

      const sql = await readFile(join(migrationsDir, file), "utf8");

      try {
        await client.query("BEGIN");
        await client.query(sql);
        await recordAppliedMigration(client, file);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");

        if (isLegacyDuplicate(error)) {
          await recordAppliedMigration(client, file);
          continue;
        }

        throw error;
      }
    }
  } finally {
    await client.end();
  }
}

async function recordAppliedMigration(client: Client, filename: string): Promise<void> {
  await client.query(
    `
      INSERT INTO schema_migrations (filename)
      VALUES ($1)
      ON CONFLICT (filename) DO NOTHING
    `,
    [filename]
  );
}

function isLegacyDuplicate(error: unknown): boolean {
  return (
    error instanceof DatabaseError &&
    duplicateErrorCodes.has(error.code) &&
    /already exists/i.test(error.message)
  );
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
