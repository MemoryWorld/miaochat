import { seedLoadTestData } from "./seed-load-test-data-lib.js";

async function main(): Promise<void> {
  const result = await seedLoadTestData({
    apiBaseUrl: requireEnv("AGENTHUB_API_BASE_URL"),
    directConversationCount: readCount("AGENTHUB_LOAD_DIRECT_COUNT", 3),
    groupConversationCount: readCount("AGENTHUB_LOAD_GROUP_COUNT", 3),
    streamConversationCount: readCount("AGENTHUB_LOAD_STREAM_COUNT", 3),
    workspaceId: process.env.AGENTHUB_WORKSPACE_ID ?? "default-workspace"
  });

  process.stdout.write(`Created load-test user: ${result.userEmail}\n`);
  process.stdout.write(`Direct conversations: ${result.directConversationIds.join(", ")}\n`);
  process.stdout.write(`Group conversations: ${result.groupConversationIds.join(", ")}\n`);
  process.stdout.write(`Stream conversations: ${result.streamConversationIds.join(", ")}\n\n`);
  process.stdout.write(`${result.exports}\n`);
}

function readCount(name: string, fallback: number): number {
  const raw = process.env[name];

  if (!raw) {
    return fallback;
  }

  const parsed = Number.parseInt(raw, 10);

  if (!Number.isFinite(parsed) || parsed < 1) {
    throw new Error(`${name} must be a positive integer.`);
  }

  return parsed;
}

function requireEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
