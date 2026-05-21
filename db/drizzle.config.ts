import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://agenthub:agenthub@localhost:5432/agenthub"
  },
  dialect: "postgresql",
  out: "./db/migrations",
  schema: "./db/schema.ts",
  verbose: true
});
