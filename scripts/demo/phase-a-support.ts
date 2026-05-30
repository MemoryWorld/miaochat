import { Socket } from "node:net";

import { Client } from "pg";

export type PhaseADemoProvider = "hermes" | "openclaw";

export type PhaseADemoProviderEnvironment = {
  accountId: string | null;
  accountIdEnvName: string;
  configured: boolean;
  provider: PhaseADemoProvider;
  secret: string | null;
  secretEnvName: string;
};

export type PhaseADemoEnvironment = {
  apiBaseUrl: string;
  credentialEncryptionKey: string;
  databaseUrl: string;
  demoEmail: string;
  demoPassword: string;
  providers: PhaseADemoProviderEnvironment[];
  redisUrl: string;
  temporalAddress: string;
};

export type PhaseADemoServiceStatus = {
  address: string;
  detail: string;
  label: "database" | "redis" | "temporal";
  ok: boolean;
};

export type PhaseADemoProviderStatus = {
  configured: boolean;
  detail: string;
  provider: PhaseADemoProvider;
};

export type PhaseADemoCheckResult = {
  environment: PhaseADemoEnvironment;
  nextAction: string;
  providers: PhaseADemoProviderStatus[];
  readyForFullDemo: boolean;
  readyForSeed: boolean;
  services: PhaseADemoServiceStatus[];
};

export type PhaseADemoCheckDependencies = {
  checkDatabase?: (databaseUrl: string) => Promise<boolean>;
  checkSocket?: (target: { host: string; port: number }) => Promise<boolean>;
};

const defaultApiBaseUrl = "http://localhost:3001";
const defaultCredentialEncryptionKey = "agenthub-dev-credential-key";
const defaultDatabaseUrl = "postgres://agenthub:agenthub@localhost:6432/agenthub";
const defaultDemoEmail = "phase-a-demo@example.com";
const defaultDemoPassword = "PhaseADemo!123";
const defaultRedisUrl = "redis://localhost:6379";
const defaultTemporalAddress = "localhost:7233";

export function readPhaseADemoEnvironment(
  env: Record<string, string | undefined>
): PhaseADemoEnvironment {
  return {
    apiBaseUrl: env.NEXT_PUBLIC_API_BASE_URL ?? defaultApiBaseUrl,
    credentialEncryptionKey:
      env.CREDENTIAL_ENCRYPTION_KEY ?? defaultCredentialEncryptionKey,
    databaseUrl: env.DATABASE_URL ?? defaultDatabaseUrl,
    demoEmail: env.MIAOCHAT_DEMO_EMAIL ?? defaultDemoEmail,
    demoPassword: env.MIAOCHAT_DEMO_PASSWORD ?? defaultDemoPassword,
    providers: [
      readProviderEnvironment(env, "hermes"),
      readProviderEnvironment(env, "openclaw")
    ],
    redisUrl: env.REDIS_URL ?? defaultRedisUrl,
    temporalAddress: env.TEMPORAL_ADDRESS ?? defaultTemporalAddress
  };
}

export async function runPhaseADemoCheck(
  environment: PhaseADemoEnvironment,
  dependencies: PhaseADemoCheckDependencies = {}
): Promise<PhaseADemoCheckResult> {
  const databaseOk = await (dependencies.checkDatabase ?? checkDatabaseReachability)(
    environment.databaseUrl
  );
  const redisTarget = parseSocketTargetFromUrl(environment.redisUrl, 6379);
  const temporalTarget = parseSocketTargetFromAddress(environment.temporalAddress, 7233);
  const checkSocket = dependencies.checkSocket ?? checkSocketReachability;
  const redisOk = await checkSocket(redisTarget);
  const temporalOk = await checkSocket(temporalTarget);

  const services: PhaseADemoServiceStatus[] = [
    {
      address: redactUrlPassword(environment.databaseUrl),
      detail: databaseOk ? "reachable" : "unreachable",
      label: "database",
      ok: databaseOk
    },
    {
      address: `${redisTarget.host}:${redisTarget.port}`,
      detail: redisOk ? "reachable" : "unreachable",
      label: "redis",
      ok: redisOk
    },
    {
      address: `${temporalTarget.host}:${temporalTarget.port}`,
      detail: temporalOk ? "reachable" : "unreachable",
      label: "temporal",
      ok: temporalOk
    }
  ];
  const providers = environment.providers.map<PhaseADemoProviderStatus>((entry) => ({
    configured: entry.configured,
    detail: entry.configured
      ? `using ${entry.accountIdEnvName} + ${entry.secretEnvName}`
      : `missing ${missingCredentialFields(entry).join(" and ")}`,
    provider: entry.provider
  }));
  const readyForSeed = services.every((service) => service.ok);
  const readyForFullDemo = readyForSeed && providers.every((provider) => provider.configured);

  return {
    environment,
    nextAction: buildNextAction({
      providers,
      readyForFullDemo,
      readyForSeed
    }),
    providers,
    readyForFullDemo,
    readyForSeed,
    services
  };
}

export function formatPhaseADemoCheckReport(result: PhaseADemoCheckResult): string {
  const lines = [
    "# Phase A Demo Check",
    "",
    `Status: ${result.readyForFullDemo ? "Ready for local demo" : result.readyForSeed ? "Ready for seed" : "Blocked"}`,
    `Workspace demo user: ${result.environment.demoEmail}`,
    ""
  ];

  lines.push("Services:");
  for (const service of result.services) {
    lines.push(
      `- ${service.label}: ${service.ok ? "OK" : "BLOCKED"} (${service.address})`
    );
  }

  lines.push("", "Provider credentials:");
  for (const provider of result.providers) {
    lines.push(
      `- ${provider.provider}: ${provider.configured ? "configured" : "missing"} (${provider.detail})`
    );
  }

  lines.push("", `Next action: ${result.nextAction}`);

  return lines.join("\n");
}

async function checkDatabaseReachability(databaseUrl: string): Promise<boolean> {
  const client = new Client({
    connectionString: databaseUrl,
    connectionTimeoutMillis: 1_500
  });

  try {
    await client.connect();
    await client.query("SELECT 1");
    return true;
  } catch {
    return false;
  } finally {
    await client.end().catch(() => undefined);
  }
}

async function checkSocketReachability(target: {
  host: string;
  port: number;
}): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const socket = new Socket();

    socket.setTimeout(1_500);
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => {
      socket.destroy();
      resolve(false);
    });
    socket.once("timeout", () => {
      socket.destroy();
      resolve(false);
    });
    socket.connect(target.port, target.host);
  });
}

function buildNextAction(input: {
  providers: PhaseADemoProviderStatus[];
  readyForFullDemo: boolean;
  readyForSeed: boolean;
}): string {
  if (!input.readyForSeed) {
    return "Start the local infra stack, then rerun `pnpm demo:check:phase-a`.";
  }

  if (input.readyForFullDemo) {
    return "Run `pnpm demo:seed:phase-a`, start the apps, and begin local demo recording.";
  }

  const missingProviders = input.providers
    .filter((provider) => !provider.configured)
    .map((provider) => provider.provider);

  return `Run \`pnpm demo:seed:phase-a\`, then open /setup after login to bind the missing providers: ${missingProviders.join(", ")}.`;
}

function missingCredentialFields(entry: PhaseADemoProviderEnvironment): string[] {
  const missing: string[] = [];

  if (!entry.accountId) {
    missing.push(entry.accountIdEnvName);
  }

  if (!entry.secret) {
    missing.push(entry.secretEnvName);
  }

  return missing;
}

function parseSocketTargetFromAddress(
  address: string,
  defaultPort: number
): { host: string; port: number } {
  const [rawHost, rawPort] = address.trim().split(":");
  const host = rawHost?.trim() || "localhost";
  const parsedPort = Number(rawPort ?? defaultPort);

  return {
    host,
    port: Number.isFinite(parsedPort) ? parsedPort : defaultPort
  };
}

function parseSocketTargetFromUrl(
  value: string,
  defaultPort: number
): { host: string; port: number } {
  const parsed = new URL(value);

  return {
    host: parsed.hostname,
    port: Number(parsed.port || defaultPort)
  };
}

function readProviderEnvironment(
  env: Record<string, string | undefined>,
  provider: PhaseADemoProvider
): PhaseADemoProviderEnvironment {
  const upper = provider.toUpperCase();
  const accountIdEnvName = `${upper}_DEMO_ACCOUNT_ID`;
  const secretEnvName = `${upper}_DEMO_SECRET`;
  const accountId = env[accountIdEnvName]?.trim() || null;
  const secret = env[secretEnvName]?.trim() || null;

  return {
    accountId,
    accountIdEnvName,
    configured: Boolean(accountId && secret),
    provider,
    secret,
    secretEnvName
  };
}

function redactUrlPassword(connectionString: string): string {
  const parsed = new URL(connectionString);

  if (parsed.password) {
    parsed.password = "******";
  }

  return parsed.toString();
}
