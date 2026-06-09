import { setTimeout as sleep } from "node:timers/promises";

import type {
  FlyContainerDeployConfig,
  VercelStaticSiteDeployConfig
} from "@agenthub/contracts";

import type { DeployFile } from "./deploy-artifact-bundle.js";
import { selectContainerIndexHtml } from "./deploy-artifact-bundle.js";

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

type VercelCreateResponse = {
  id?: string;
  readyState?: string;
  url?: string | null;
};

type FlyMachineResponse = {
  id?: string;
  state?: string;
};

export type VercelDeploymentResult = {
  previewUrl: string;
  providerDeploymentId: string;
};

export type FlyDeploymentResult = {
  machineId: string;
  previewUrl: string;
};

export async function createVercelStaticDeployment(input: {
  config: VercelStaticSiteDeployConfig;
  fetchImpl?: FetchLike;
  files: DeployFile[];
  token: string;
}): Promise<VercelDeploymentResult> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const projectName = input.config.projectName ?? "miaochat-preview";
  const deployment = await fetchJson<VercelCreateResponse>(
    buildVercelUrl("/v13/deployments", input.config.teamId),
    {
      body: JSON.stringify({
        files: input.files.map((file) => ({
          data: file.data.toString("utf8"),
          file: file.path
        })),
        name: projectName,
        project: projectName,
        projectSettings: {
          buildCommand: null,
          devCommand: null,
          framework: null,
          installCommand: null,
          outputDirectory: "."
        },
        ...(input.config.target === "production" ? { target: "production" } : {})
      }),
      headers: bearerJsonHeaders(input.token),
      method: "POST"
    },
    fetchImpl
  );

  const readyDeployment =
    deployment.readyState === "READY"
      ? deployment
      : await waitForVercelDeployment({
          config: input.config,
          deploymentId: requireString(deployment.id, "Vercel deployment id"),
          fetchImpl,
          token: input.token
        });
  const deploymentId = requireString(readyDeployment.id ?? deployment.id, "Vercel deployment id");
  const deploymentUrl = requireString(readyDeployment.url ?? deployment.url, "Vercel deployment URL");

  return {
    previewUrl: resolveVercelPreviewUrl(input.config, deploymentUrl),
    providerDeploymentId: deploymentId
  };
}

export async function createFlyMachineDeployment(input: {
  config: FlyContainerDeployConfig;
  fetchImpl?: FetchLike;
  files: DeployFile[];
  token: string;
}): Promise<FlyDeploymentResult> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const appName = input.config.appName ?? "miaochat-container-preview";
  const machinesBaseUrl = "https://api.machines.dev/v1";

  await ensureFlyApp({
    appName,
    config: input.config,
    fetchImpl,
    machinesBaseUrl,
    token: input.token
  });

  if (input.config.allocateSharedIpv4) {
    await allocateFlySharedIpv4({
      appName,
      fetchImpl,
      token: input.token
    });
  }

  const html = selectContainerIndexHtml(input.files, appName);
  const machine = await fetchJson<FlyMachineResponse>(
    `${machinesBaseUrl}/apps/${encodeURIComponent(appName)}/machines`,
    {
      body: JSON.stringify({
        config: {
          env: {
            MIAOCHAT_DEPLOY_HTML_B64: Buffer.from(html, "utf8").toString("base64")
          },
          guest: {
            cpu_kind: "shared",
            cpus: 1,
            memory_mb: input.config.guestMemoryMb
          },
          image: input.config.machineImage,
          init: {
            cmd: [
              "sh",
              "-lc",
              "mkdir -p /usr/share/nginx/html && printf '%s' \"$MIAOCHAT_DEPLOY_HTML_B64\" | base64 -d > /usr/share/nginx/html/index.html && nginx -g 'daemon off;'"
            ]
          },
          metadata: {
            fly_process_group: "app",
            fly_platform_version: "v2",
            miaochat_deploy: "true"
          },
          services: [
            {
              autostart: true,
              autostop: "suspend",
              internal_port: 80,
              min_machines_running: 0,
              ports: [
                {
                  handlers: ["http"],
                  port: 80
                },
                {
                  handlers: ["tls", "http"],
                  port: 443
                }
              ],
              protocol: "tcp"
            }
          ]
        },
        region: input.config.region
      }),
      headers: bearerJsonHeaders(input.token),
      method: "POST"
    },
    fetchImpl
  );
  const machineId = requireString(machine.id, "Fly machine id");

  await fetchJson<FlyMachineResponse>(
    `${machinesBaseUrl}/apps/${encodeURIComponent(appName)}/machines/${encodeURIComponent(machineId)}/wait?state=started&timeout=60`,
    {
      headers: bearerJsonHeaders(input.token),
      method: "GET"
    },
    fetchImpl
  );

  return {
    machineId,
    previewUrl: `https://${appName}.fly.dev`
  };
}

async function waitForVercelDeployment(input: {
  config: VercelStaticSiteDeployConfig;
  deploymentId: string;
  fetchImpl: FetchLike;
  token: string;
}): Promise<VercelCreateResponse> {
  const start = Date.now();
  while (Date.now() - start < input.config.pollTimeoutMs) {
    const deployment = await fetchJson<VercelCreateResponse>(
      buildVercelUrl(
        `/v13/deployments/${encodeURIComponent(input.deploymentId)}`,
        input.config.teamId
      ),
      {
        headers: bearerJsonHeaders(input.token),
        method: "GET"
      },
      input.fetchImpl
    );

    if (deployment.readyState === "READY") {
      return deployment;
    }

    if (deployment.readyState === "ERROR" || deployment.readyState === "CANCELED") {
      throw new Error(`Vercel deployment ${input.deploymentId} ended as ${deployment.readyState}.`);
    }

    await sleep(input.config.pollIntervalMs);
  }

  throw new Error(`Vercel deployment ${input.deploymentId} did not become ready in time.`);
}

async function ensureFlyApp(input: {
  appName: string;
  config: FlyContainerDeployConfig;
  fetchImpl: FetchLike;
  machinesBaseUrl: string;
  token: string;
}): Promise<void> {
  const appUrl = `${input.machinesBaseUrl}/apps/${encodeURIComponent(input.appName)}`;
  const response = await input.fetchImpl(appUrl, {
    headers: bearerJsonHeaders(input.token),
    method: "GET"
  });

  if (response.ok) {
    return;
  }

  if (response.status !== 404) {
    throw new Error(`Fly app lookup failed with HTTP ${response.status}.`);
  }

  await fetchJson<Record<string, unknown>>(
    `${input.machinesBaseUrl}/apps`,
    {
      body: JSON.stringify({
        app_name: input.appName,
        org_slug: input.config.orgSlug
      }),
      headers: bearerJsonHeaders(input.token),
      method: "POST"
    },
    input.fetchImpl
  );
}

async function allocateFlySharedIpv4(input: {
  appName: string;
  fetchImpl: FetchLike;
  token: string;
}): Promise<void> {
  await fetchJson<Record<string, unknown>>(
    "https://api.fly.io/graphql",
    {
      body: JSON.stringify({
        query:
          "mutation($input: AllocateIPAddressInput!){ allocateIpAddress(input: $input) { app { sharedIpAddress } } }",
        variables: {
          input: {
            appId: input.appName,
            region: "",
            type: "shared_v4"
          }
        }
      }),
      headers: bearerJsonHeaders(input.token),
      method: "POST"
    },
    input.fetchImpl
  );
}

async function fetchJson<T>(
  url: string,
  init: RequestInit,
  fetchImpl: FetchLike
): Promise<T> {
  const response = await fetchImpl(url, init);
  const text = await response.text();

  if (!response.ok) {
    throw new Error(`Deploy provider request failed with HTTP ${response.status}: ${text}`);
  }

  return (text ? JSON.parse(text) : {}) as T;
}

function buildVercelUrl(path: string, teamId: string | undefined): string {
  const url = new URL(path, "https://api.vercel.com");
  if (teamId) {
    url.searchParams.set("teamId", teamId);
  }
  return url.toString();
}

function bearerJsonHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json"
  };
}

function requireString(value: string | null | undefined, label: string): string {
  if (!value) {
    throw new Error(`${label} was missing from provider response.`);
  }
  return value;
}

function normalizeHttpsUrl(value: string): string {
  if (value.startsWith("http://") || value.startsWith("https://")) {
    return value;
  }
  return `https://${value}`;
}

function resolveVercelPreviewUrl(
  config: VercelStaticSiteDeployConfig,
  deploymentUrl: string
): string {
  if (config.target === "production" && config.projectName) {
    return `https://${config.projectName}.vercel.app`;
  }

  return normalizeHttpsUrl(deploymentUrl);
}
