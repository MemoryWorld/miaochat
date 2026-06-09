type FetchLike = typeof fetch;

export type DeployAcceptanceTarget = "container" | "source" | "static";

export type DeployAcceptanceEnvironment = {
  apiBaseUrl: string;
  flyApiToken: string | null;
  flyAppPrefix: string;
  flyOrgSlug: string;
  flyRegion: string;
  publicUrlPollIntervalMs: number;
  publicUrlTimeoutMs: number;
  runId: string;
  s3Bucket: string | null;
  s3Endpoint: string | null;
  s3PublicBaseUrl: string | null;
  s3Region: string | null;
  s3SourcePrefix: string;
  s3AccessKey: string | null;
  s3SecretKey: string | null;
  targets: DeployAcceptanceTarget[];
  userEmail: string;
  userPassword: string;
  vercelDeployTarget: "preview" | "production";
  vercelProjectPrefix: string;
  vercelTeamId: string | null;
  vercelToken: string | null;
  workspaceId: string;
};

export type AuthenticatedSession = {
  cookie: string;
  user: {
    id: string;
    email: string;
  };
};

export type SeededDeployTarget = {
  kind: "container" | "source-archive" | "static-site";
  name: string;
  providerResourceName: string | null;
};

export type DeployAcceptanceResult = {
  artifactId: string;
  conversationId: string;
  cleanup: {
    flyApps: string[];
    s3Keys: string[];
    vercelProjects: string[];
  };
  deployments: Array<{
    deploymentId: string;
    kind: SeededDeployTarget["kind"];
    name: string;
    previewUrl: string;
    publicUrlVerified: boolean;
    resultMessage: string;
    status: string;
  }>;
  runId: string;
  targetNames: string[];
  userEmail: string;
  workspaceId: string;
};

type ApiClient = {
  apiBaseUrl: string;
  fetchImpl: FetchLike;
};

type UploadTarget = {
  artifactId: string;
  previewUrl: string | null;
  storageKey: string;
  uploadHeaders: Record<string, string>;
  uploadMethod: "PUT";
  uploadUrl: string;
};

type DeploymentDispatchResponse = {
  artifact: {
    id: string;
  };
  deployment: {
    id: string;
    previewUrl: string | null;
    resultMessage: string;
    status: string;
    targetKind: SeededDeployTarget["kind"];
  };
  target: {
    name: string;
  };
};

const allDeployTargets: DeployAcceptanceTarget[] = ["static", "container", "source"];

export function readDeployAcceptanceEnvironment(
  env: Record<string, string | undefined> = process.env
): DeployAcceptanceEnvironment {
  const runId = sanitizeDeployName(env.MIAOCHAT_DEPLOY_RUN_ID ?? makeRunId());

  return {
    apiBaseUrl: stripTrailingSlash(
      env.MIAOCHAT_DEPLOY_API_BASE_URL ??
        env.AGENTHUB_API_BASE_URL ??
        env.NEXT_PUBLIC_API_BASE_URL ??
        "http://localhost:3001"
    ),
    flyApiToken: readOptionalEnv(env, "FLY_API_TOKEN"),
    flyAppPrefix: readOptionalEnv(env, "FLY_APP_PREFIX") ?? "miaochat-container",
    flyOrgSlug: readOptionalEnv(env, "FLY_ORG_SLUG") ?? "personal",
    flyRegion: readOptionalEnv(env, "FLY_REGION") ?? "syd",
    publicUrlPollIntervalMs: readPositiveInt(env, "MIAOCHAT_DEPLOY_PUBLIC_URL_POLL_MS", 5_000),
    publicUrlTimeoutMs: readPositiveInt(env, "MIAOCHAT_DEPLOY_PUBLIC_URL_TIMEOUT_MS", 180_000),
    runId,
    s3AccessKey: readOptionalEnv(env, "S3_ACCESS_KEY"),
    s3Bucket: readOptionalEnv(env, "S3_BUCKET"),
    s3Endpoint: readOptionalEnv(env, "S3_ENDPOINT"),
    s3PublicBaseUrl: readOptionalEnv(env, "S3_PUBLIC_BASE_URL"),
    s3Region: readOptionalEnv(env, "S3_REGION"),
    s3SecretKey: readOptionalEnv(env, "S3_SECRET_KEY"),
    s3SourcePrefix:
      readOptionalEnv(env, "MIAOCHAT_DEPLOY_SOURCE_PREFIX") ??
      "deployments/source-archives",
    targets: parseDeployTargets(env.MIAOCHAT_DEPLOY_TARGETS),
    userEmail:
      readOptionalEnv(env, "MIAOCHAT_DEPLOY_EMAIL") ??
      `deploy-acceptance-${runId}@example.com`,
    userPassword:
      readOptionalEnv(env, "MIAOCHAT_DEPLOY_PASSWORD") ?? makeDeployAcceptancePassword(runId),
    vercelDeployTarget: parseVercelDeployTarget(env.VERCEL_DEPLOY_TARGET),
    vercelProjectPrefix:
      readOptionalEnv(env, "VERCEL_PROJECT_PREFIX") ?? "miaochat-static",
    vercelTeamId: readOptionalEnv(env, "VERCEL_TEAM_ID"),
    vercelToken: readOptionalEnv(env, "VERCEL_TOKEN"),
    workspaceId: readOptionalEnv(env, "MIAOCHAT_DEPLOY_WORKSPACE_ID") ?? "default-workspace"
  };
}

export function getMissingDeployAcceptanceVariables(
  environment: DeployAcceptanceEnvironment
): string[] {
  const missing = new Set<string>();

  if (environment.targets.includes("static") && !environment.vercelToken) {
    missing.add("VERCEL_TOKEN");
  }

  if (environment.targets.includes("container") && !environment.flyApiToken) {
    missing.add("FLY_API_TOKEN");
  }

  if (environment.targets.includes("source")) {
    for (const [name, value] of [
      ["S3_ACCESS_KEY", environment.s3AccessKey],
      ["S3_BUCKET", environment.s3Bucket],
      ["S3_ENDPOINT", environment.s3Endpoint],
      ["S3_PUBLIC_BASE_URL", environment.s3PublicBaseUrl],
      ["S3_REGION", environment.s3Region],
      ["S3_SECRET_KEY", environment.s3SecretKey]
    ] as const) {
      if (!value) {
        missing.add(name);
      }
    }
  }

  return [...missing].sort();
}

export async function authenticateDeployAcceptanceUser(
  environment: DeployAcceptanceEnvironment,
  fetchImpl: FetchLike = fetch
): Promise<AuthenticatedSession> {
  const client = createApiClient(environment.apiBaseUrl, fetchImpl);
  const signup = await requestJsonWithResponse<{
    user: AuthenticatedSession["user"];
  }>(client, "/auth/signup", {
    body: {
      displayName: "Miaochat Deploy Acceptance",
      email: environment.userEmail,
      password: environment.userPassword
    },
    method: "POST"
  });

  if (signup.response.ok) {
    return {
      cookie: parseSessionCookie(signup.response.headers.get("set-cookie")),
      user: signup.payload.user
    };
  }

  if (signup.response.status !== 409) {
    throw new Error(
      `Signup failed with HTTP ${signup.response.status}: ${readErrorMessage(signup.payload)}`
    );
  }

  const login = await requestJsonWithResponse<{
    user: AuthenticatedSession["user"];
  }>(client, "/auth/login", {
    body: {
      email: environment.userEmail,
      password: environment.userPassword
    },
    method: "POST"
  });

  if (!login.response.ok) {
    throw new Error(
      `Login failed with HTTP ${login.response.status}: ${readErrorMessage(login.payload)}`
    );
  }

  return {
    cookie: parseSessionCookie(login.response.headers.get("set-cookie")),
    user: login.payload.user
  };
}

export async function seedRealDeployTargets(input: {
  environment: DeployAcceptanceEnvironment;
  fetchImpl?: FetchLike;
  session: AuthenticatedSession;
}): Promise<SeededDeployTarget[]> {
  const client = createApiClient(input.environment.apiBaseUrl, input.fetchImpl ?? fetch);
  await ensureWorkspace({
    client,
    cookie: input.session.cookie,
    workspaceId: input.environment.workspaceId
  });

  const targets: SeededDeployTarget[] = [];

  for (const draft of buildDeployTargetDrafts(input.environment)) {
    const payload = await requestJson<Record<string, unknown>>(client, "/deploys/targets", {
      body: draft.payload,
      cookie: input.session.cookie,
      method: "POST"
    });

    if (typeof payload.name !== "string") {
      throw new Error(`Deploy target ${draft.name} response did not include a name.`);
    }

    targets.push({
      kind: draft.kind,
      name: draft.name,
      providerResourceName: draft.providerResourceName
    });
  }

  return targets;
}

export async function runRealDeployAcceptance(input: {
  environment: DeployAcceptanceEnvironment;
  fetchImpl?: FetchLike;
}): Promise<DeployAcceptanceResult> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const client = createApiClient(input.environment.apiBaseUrl, fetchImpl);
  const session = await authenticateDeployAcceptanceUser(input.environment, fetchImpl);
  await ensureWorkspace({
    client,
    cookie: session.cookie,
    workspaceId: input.environment.workspaceId
  });

  const agentId = await createCustomAgent({
    client,
    cookie: session.cookie,
    environment: input.environment
  });
  const conversationId = await createConversation({
    agentId,
    client,
    cookie: session.cookie,
    environment: input.environment
  });
  const messageId = await createMessage({
    client,
    conversationId,
    cookie: session.cookie,
    environment: input.environment
  });
  const upload = await uploadDeployManifestArtifact({
    client,
    cookie: session.cookie,
    environment: input.environment,
    messageId
  });
  const targets = await seedRealDeployTargets({
    environment: input.environment,
    fetchImpl,
    session
  });
  const deployments: DeployAcceptanceResult["deployments"] = [];
  const cleanup = {
    flyApps: targets
      .filter((target) => target.kind === "container" && target.providerResourceName)
      .map((target) => target.providerResourceName as string),
    s3Keys: [] as string[],
    vercelProjects: targets
      .filter((target) => target.kind === "static-site" && target.providerResourceName)
      .map((target) => target.providerResourceName as string)
  };

  for (const target of targets) {
    const dispatch = await requestJson<DeploymentDispatchResponse>(client, "/deploys", {
      body: {
        conversationId,
        targetName: target.name,
        workspaceId: input.environment.workspaceId
      },
      cookie: session.cookie,
      method: "POST"
    });

    if (dispatch.deployment.status !== "succeeded") {
      throw new Error(
        `Deploy target ${target.name} ended with status ${dispatch.deployment.status}: ${dispatch.deployment.resultMessage}`
      );
    }

    const previewUrl = dispatch.deployment.previewUrl;
    if (!previewUrl) {
      throw new Error(`Deploy target ${target.name} succeeded without a preview/download URL.`);
    }

    const publicUrlVerified = await waitForPublicUrl({
      fetchImpl,
      marker: input.environment.runId,
      pollIntervalMs: input.environment.publicUrlPollIntervalMs,
      timeoutMs: input.environment.publicUrlTimeoutMs,
      url: previewUrl
    });

    if (target.kind === "source-archive") {
      cleanup.s3Keys.push(
        buildPublishedSourceKey({
          deploymentId: dispatch.deployment.id,
          environment: input.environment,
          sourceStorageKey: upload.storageKey
        })
      );
    }

    deployments.push({
      deploymentId: dispatch.deployment.id,
      kind: dispatch.deployment.targetKind,
      name: target.name,
      previewUrl,
      publicUrlVerified,
      resultMessage: dispatch.deployment.resultMessage,
      status: dispatch.deployment.status
    });
  }

  return {
    artifactId: upload.artifactId,
    cleanup,
    conversationId,
    deployments,
    runId: input.environment.runId,
    targetNames: targets.map((target) => target.name),
    userEmail: input.environment.userEmail,
    workspaceId: input.environment.workspaceId
  };
}

export function formatDeployAcceptanceReport(result: DeployAcceptanceResult): string {
  const lines = [
    "# Real Deploy Acceptance",
    "",
    `Status: ${result.deployments.every((entry) => entry.publicUrlVerified) ? "PASSED" : "FAILED"}`,
    `Run ID: ${result.runId}`,
    `User: ${result.userEmail}`,
    `Workspace: ${result.workspaceId}`,
    `Conversation: ${result.conversationId}`,
    `Artifact: ${result.artifactId}`,
    "",
    "Deployments:"
  ];

  for (const deployment of result.deployments) {
    lines.push(
      `- ${deployment.kind} (${deployment.name}): ${deployment.status}, url verified=${deployment.publicUrlVerified ? "yes" : "no"}`
    );
    lines.push(`  ${deployment.previewUrl}`);
  }

  lines.push("", "Cleanup exports:");
  if (result.cleanup.vercelProjects.length > 0) {
    lines.push(
      `export MIAOCHAT_DEPLOY_CLEANUP_VERCEL_PROJECTS=${result.cleanup.vercelProjects.join(",")}`
    );
  }
  if (result.cleanup.flyApps.length > 0) {
    lines.push(`export MIAOCHAT_DEPLOY_CLEANUP_FLY_APPS=${result.cleanup.flyApps.join(",")}`);
  }
  if (result.cleanup.s3Keys.length > 0) {
    lines.push(`export MIAOCHAT_DEPLOY_CLEANUP_S3_KEYS=${result.cleanup.s3Keys.join(",")}`);
  }
  lines.push("pnpm deploy:cleanup:real");

  return lines.join("\n");
}

function buildDeployTargetDrafts(environment: DeployAcceptanceEnvironment): Array<{
  kind: SeededDeployTarget["kind"];
  name: string;
  payload: Record<string, unknown>;
  providerResourceName: string | null;
}> {
  const drafts: Array<{
    kind: SeededDeployTarget["kind"];
    name: string;
    payload: Record<string, unknown>;
    providerResourceName: string | null;
  }> = [];

  if (environment.targets.includes("static")) {
    const projectName = buildProviderResourceName(
      environment.vercelProjectPrefix,
      environment.runId,
      63
    );
    drafts.push({
      kind: "static-site",
      name: `vercel-static-${environment.runId}`,
      payload: {
        config: removeUndefinedValues({
          projectName,
          provider: "vercel",
          target: environment.vercelDeployTarget,
          teamId: environment.vercelTeamId ?? undefined
        }),
        credentialSource: "user_provided",
        kind: "static-site",
        name: `vercel-static-${environment.runId}`,
        rawSecret: environment.vercelToken,
        workspaceId: environment.workspaceId
      },
      providerResourceName: projectName
    });
  }

  if (environment.targets.includes("container")) {
    const appName = buildProviderResourceName(
      environment.flyAppPrefix,
      environment.runId,
      63
    );
    drafts.push({
      kind: "container",
      name: `fly-container-${environment.runId}`,
      payload: {
        config: {
          appName,
          orgSlug: environment.flyOrgSlug,
          provider: "fly",
          region: environment.flyRegion
        },
        credentialSource: "user_provided",
        kind: "container",
        name: `fly-container-${environment.runId}`,
        rawSecret: environment.flyApiToken,
        workspaceId: environment.workspaceId
      },
      providerResourceName: appName
    });
  }

  if (environment.targets.includes("source")) {
    drafts.push({
      kind: "source-archive",
      name: `s3-source-${environment.runId}`,
      payload: {
        config: {
          bucket: environment.s3Bucket,
          provider: "s3-compatible",
          publicBaseUrl: environment.s3PublicBaseUrl,
          storagePrefix: environment.s3SourcePrefix
        },
        credentialSource: "platform_managed",
        kind: "source-archive",
        name: `s3-source-${environment.runId}`,
        workspaceId: environment.workspaceId
      },
      providerResourceName: null
    });
  }

  return drafts;
}

function createApiClient(apiBaseUrl: string, fetchImpl: FetchLike): ApiClient {
  return {
    apiBaseUrl: stripTrailingSlash(apiBaseUrl),
    fetchImpl
  };
}

async function ensureWorkspace(input: {
  client: ApiClient;
  cookie: string;
  workspaceId: string;
}): Promise<void> {
  if (input.workspaceId === "default-workspace") {
    return;
  }

  const response = await requestJsonWithResponse<unknown>(input.client, "/workspaces", {
    body: {
      id: input.workspaceId,
      name: `Deploy Acceptance ${input.workspaceId}`
    },
    cookie: input.cookie,
    method: "POST"
  });

  if (response.response.ok || response.response.status === 409) {
    return;
  }

  throw new Error(
    `Workspace creation failed with HTTP ${response.response.status}: ${readErrorMessage(
      response.payload
    )}`
  );
}

async function createCustomAgent(input: {
  client: ApiClient;
  cookie: string;
  environment: DeployAcceptanceEnvironment;
}): Promise<string> {
  const response = await requestJson<Record<string, unknown>>(input.client, "/custom-agents", {
    body: {
      capabilityTags: ["deploy", "acceptance"],
      name: `Deploy Acceptance Agent ${input.environment.runId}`,
      provider: "mock",
      systemPrompt: "Support the real deployment acceptance smoke test.",
      toolBindings: [],
      workspaceId: input.environment.workspaceId
    },
    cookie: input.cookie,
    method: "POST"
  });

  return readStringProperty(response, "id", "custom agent");
}

async function createConversation(input: {
  agentId: string;
  client: ApiClient;
  cookie: string;
  environment: DeployAcceptanceEnvironment;
}): Promise<string> {
  const response = await requestJson<Record<string, unknown>>(input.client, "/conversations", {
    body: {
      agentIds: [input.agentId],
      mode: "direct",
      title: `Deploy acceptance ${input.environment.runId}`,
      workspaceId: input.environment.workspaceId
    },
    cookie: input.cookie,
    method: "POST"
  });

  return readStringProperty(response, "id", "conversation");
}

async function createMessage(input: {
  client: ApiClient;
  conversationId: string;
  cookie: string;
  environment: DeployAcceptanceEnvironment;
}): Promise<string> {
  const response = await requestJson<Record<string, unknown>>(input.client, "/messages", {
    body: {
      content: `Deploy acceptance artifact for ${input.environment.runId}.`,
      conversationId: input.conversationId,
      role: "user",
      workspaceId: input.environment.workspaceId
    },
    cookie: input.cookie,
    method: "POST"
  });

  return readStringProperty(response, "id", "message");
}

async function uploadDeployManifestArtifact(input: {
  client: ApiClient;
  cookie: string;
  environment: DeployAcceptanceEnvironment;
  messageId: string;
}): Promise<{
  artifactId: string;
  storageKey: string;
}> {
  const fileName = `miaochat-${input.environment.runId}.deploy.json`;
  const uploadTarget = await requestJson<UploadTarget>(input.client, "/artifacts/upload-target", {
    body: {
      fileName,
      kind: "attachment",
      messageId: input.messageId,
      mimeType: "application/json",
      title: `Deploy acceptance bundle ${input.environment.runId}`,
      workspaceId: input.environment.workspaceId
    },
    cookie: input.cookie,
    method: "POST"
  });
  const manifest = buildDeployManifest(input.environment);
  const uploadResponse = await input.client.fetchImpl(uploadTarget.uploadUrl, {
    body: JSON.stringify(manifest),
    headers: {
      ...uploadTarget.uploadHeaders,
      "Content-Type": uploadTarget.uploadHeaders["content-type"] ?? "application/json"
    },
    method: uploadTarget.uploadMethod
  });

  if (!uploadResponse.ok) {
    throw new Error(
      `Artifact upload failed with HTTP ${uploadResponse.status}: ${await uploadResponse.text()}`
    );
  }

  await requestJson<Record<string, unknown>>(input.client, "/artifacts", {
    body: {
      id: uploadTarget.artifactId,
      kind: "attachment",
      messageId: input.messageId,
      mimeType: "application/json",
      previewUrl: uploadTarget.previewUrl,
      storageKey: uploadTarget.storageKey,
      title: `Deploy acceptance bundle ${input.environment.runId}`,
      workspaceId: input.environment.workspaceId
    },
    cookie: input.cookie,
    method: "POST"
  });

  return {
    artifactId: uploadTarget.artifactId,
    storageKey: uploadTarget.storageKey
  };
}

function buildDeployManifest(environment: DeployAcceptanceEnvironment): {
  files: Array<{ content: string; contentType: string; path: string }>;
} {
  return {
    files: [
      {
        content: [
          "<!doctype html>",
          "<html>",
          "<head>",
          "<meta charset=\"utf-8\">",
          "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">",
          `<title>Miaochat Deploy Acceptance ${environment.runId}</title>`,
          "</head>",
          `<body data-miaochat-deploy-run="${environment.runId}">`,
          `<main><h1>Miaochat deploy acceptance ${environment.runId}</h1>`,
          "<p>Real provider smoke test artifact.</p></main>",
          "</body>",
          "</html>"
        ].join(""),
        contentType: "text/html; charset=utf-8",
        path: "index.html"
      },
      {
        content:
          "body{font-family:system-ui,sans-serif;margin:2rem;color:#18212f;background:#f8fafc}",
        contentType: "text/css; charset=utf-8",
        path: "assets/styles.css"
      }
    ]
  };
}

async function waitForPublicUrl(input: {
  fetchImpl: FetchLike;
  marker: string;
  pollIntervalMs: number;
  timeoutMs: number;
  url: string;
}): Promise<boolean> {
  const startedAt = Date.now();
  let lastError = "";

  while (Date.now() - startedAt < input.timeoutMs) {
    try {
      const response = await input.fetchImpl(input.url, {
        method: "GET"
      });
      const body = await response.text();

      if (response.ok && body.includes(input.marker)) {
        return true;
      }

      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }

    await sleep(input.pollIntervalMs);
  }

  throw new Error(`Public URL did not expose run marker ${input.marker}: ${lastError}`);
}

async function requestJson<T>(
  client: ApiClient,
  path: string,
  init: {
    body?: unknown;
    cookie?: string;
    method: string;
  }
): Promise<T> {
  const result = await requestJsonWithResponse<T>(client, path, init);

  if (!result.response.ok) {
    throw new Error(
      `${init.method} ${path} failed with HTTP ${result.response.status}: ${readErrorMessage(
        result.payload
      )}`
    );
  }

  return result.payload;
}

async function requestJsonWithResponse<T>(
  client: ApiClient,
  path: string,
  init: {
    body?: unknown;
    cookie?: string;
    method: string;
  }
): Promise<{
  payload: T;
  response: Response;
}> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json"
  };

  if (init.cookie) {
    headers.Cookie = init.cookie;
  }

  const response = await client.fetchImpl(`${client.apiBaseUrl}${path}`, {
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    headers,
    method: init.method
  });
  const text = await response.text();

  return {
    payload: (text ? JSON.parse(text) : null) as T,
    response
  };
}

function buildPublishedSourceKey(input: {
  deploymentId: string;
  environment: DeployAcceptanceEnvironment;
  sourceStorageKey: string;
}): string {
  return [
    input.environment.s3SourcePrefix.replace(/\/+$/, ""),
    sanitizeStorageSegment(input.environment.workspaceId),
    sanitizeStorageSegment(input.deploymentId),
    sanitizeStorageSegment(input.sourceStorageKey.split("/").at(-1) ?? "artifact")
  ].join("/");
}

function buildProviderResourceName(prefix: string, runId: string, maxLength: number): string {
  const suffix = `-${runId}`;
  const cleanedPrefix = sanitizeDeployName(prefix) || "miaochat";
  const availablePrefixLength = Math.max(1, maxLength - suffix.length);
  const trimmedPrefix = cleanedPrefix.slice(0, availablePrefixLength).replace(/-+$/g, "");

  return sanitizeDeployName(`${trimmedPrefix}${suffix}`);
}

function sanitizeDeployName(value: string): string {
  const sanitized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");

  return sanitized || "miaochat";
}

function sanitizeStorageSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-");
}

function removeUndefinedValues(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
}

function parseDeployTargets(value: string | undefined): DeployAcceptanceTarget[] {
  if (!value?.trim()) {
    return allDeployTargets;
  }

  const parsed = value
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  const invalid = parsed.filter(
    (entry): entry is string => !allDeployTargets.includes(entry as DeployAcceptanceTarget)
  );

  if (invalid.length > 0) {
    throw new Error(
      `MIAOCHAT_DEPLOY_TARGETS contains unsupported value(s): ${invalid.join(", ")}`
    );
  }

  return [...new Set(parsed as DeployAcceptanceTarget[])];
}

function parseVercelDeployTarget(value: string | undefined): "preview" | "production" {
  if (!value?.trim()) {
    return "production";
  }

  if (value === "preview" || value === "production") {
    return value;
  }

  throw new Error("VERCEL_DEPLOY_TARGET must be either preview or production.");
}

function parseSessionCookie(setCookieHeader: string | null): string {
  if (!setCookieHeader) {
    throw new Error("Expected auth response to include a session cookie.");
  }

  const [cookie] = setCookieHeader.split(";");
  if (!cookie?.includes("=")) {
    throw new Error(`Could not parse session cookie from header: ${setCookieHeader}`);
  }

  return cookie;
}

function readStringProperty(
  payload: Record<string, unknown>,
  property: string,
  label: string
): string {
  const value = payload[property];

  if (typeof value === "string" && value.length > 0) {
    return value;
  }

  throw new Error(`Response for ${label} did not include ${property}.`);
}

function readErrorMessage(payload: unknown): string {
  if (typeof payload === "object" && payload !== null && "message" in payload) {
    const message = (payload as { message?: unknown }).message;

    if (typeof message === "string") {
      return message;
    }

    if (Array.isArray(message)) {
      return message.join("; ");
    }
  }

  return "No error message returned.";
}

function readOptionalEnv(
  env: Record<string, string | undefined>,
  name: string
): string | null {
  return env[name]?.trim() || null;
}

function readPositiveInt(
  env: Record<string, string | undefined>,
  name: string,
  fallback: number
): number {
  const value = env[name];
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    throw new Error(`${name} must be a positive integer.`);
  }

  return parsed;
}

function makeRunId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

function makeDeployAcceptancePassword(runId: string): string {
  return `Miao-${runId}-Deploy!${runId.length}`;
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
