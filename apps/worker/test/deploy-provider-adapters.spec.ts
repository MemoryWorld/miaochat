import { describe, expect, it, vi } from "vitest";

import type { DeployFile } from "../src/activities/deploy-artifact-bundle.js";
import {
  createFlyMachineDeployment,
  createVercelStaticDeployment
} from "../src/activities/deploy-provider-adapters.js";

const files: DeployFile[] = [
  {
    data: Buffer.from("<html><body>Ship it</body></html>", "utf8"),
    path: "index.html"
  }
];

describe("deploy provider adapters", () => {
  it("creates a Vercel preview deployment from artifact files", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toContain("https://api.vercel.com/v13/deployments?teamId=team_123");
      expect(init?.headers).toMatchObject({
        Authorization: "Bearer vercel_token",
        "Content-Type": "application/json"
      });
      const body = JSON.parse(String(init?.body)) as {
        files: Array<{ data: string; file: string }>;
        name: string;
        target?: string;
      };
      expect(body.name).toBe("miaochat-preview");
      expect(body.target).toBeUndefined();
      expect(body.files).toEqual([
        {
          data: "<html><body>Ship it</body></html>",
          file: "index.html"
        }
      ]);

      return jsonResponse({
        id: "dpl_123",
        readyState: "READY",
        url: "miaochat-preview.vercel.app"
      });
    });

    await expect(
      createVercelStaticDeployment({
        config: {
          pollIntervalMs: 1,
          pollTimeoutMs: 1_000,
          projectName: "miaochat-preview",
          provider: "vercel",
          target: "preview",
          teamId: "team_123"
        },
        fetchImpl: fetchMock,
        files,
        token: "vercel_token"
      })
    ).resolves.toEqual({
      previewUrl: "https://miaochat-preview.vercel.app",
      providerDeploymentId: "dpl_123"
    });
  });

  it("uses the public project domain for Vercel production deployments", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as {
        target?: string;
      };
      expect(body.target).toBe("production");

      return jsonResponse({
        id: "dpl_production",
        readyState: "READY",
        url: "miaochat-static-production-abc123.vercel.app"
      });
    });

    await expect(
      createVercelStaticDeployment({
        config: {
          pollIntervalMs: 1,
          pollTimeoutMs: 1_000,
          projectName: "miaochat-static-production",
          provider: "vercel",
          target: "production"
        },
        fetchImpl: fetchMock,
        files,
        token: "vercel_token"
      })
    ).resolves.toEqual({
      previewUrl: "https://miaochat-static-production.vercel.app",
      providerDeploymentId: "dpl_production"
    });
  });

  it("creates a Fly app, allocates routing, and starts a machine", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";

      if (url === "https://api.machines.dev/v1/apps/miaochat-container") {
        return jsonResponse({ error: "missing" }, 404);
      }

      if (url === "https://api.machines.dev/v1/apps" && method === "POST") {
        expect(JSON.parse(String(init?.body))).toMatchObject({
          app_name: "miaochat-container",
          org_slug: "personal"
        });
        return jsonResponse({ id: "app_123" }, 201);
      }

      if (url === "https://api.fly.io/graphql" && method === "POST") {
        expect(String(init?.body)).toContain("allocateIpAddress");
        return jsonResponse({
          data: {
            allocateIpAddress: {
              app: {
                sharedIpAddress: "127.0.0.1"
              }
            }
          }
        });
      }

      if (
        url === "https://api.machines.dev/v1/apps/miaochat-container/machines" &&
        method === "POST"
      ) {
        const body = JSON.parse(String(init?.body)) as {
          config: { env: Record<string, string>; image: string };
          region: string;
        };
        expect(body.region).toBe("syd");
        expect(body.config.image).toBe("nginx:1.27-alpine");
        expect(body.config.env.MIAOCHAT_DEPLOY_HTML_B64).toBeTruthy();
        return jsonResponse({ id: "machine_123" }, 201);
      }

      if (
        url ===
        "https://api.machines.dev/v1/apps/miaochat-container/machines/machine_123/wait?state=started&timeout=60"
      ) {
        return jsonResponse({ state: "started" }, 200);
      }

      throw new Error(`Unexpected request ${method} ${url}`);
    });

    await expect(
      createFlyMachineDeployment({
        config: {
          allocateSharedIpv4: true,
          appName: "miaochat-container",
          guestMemoryMb: 256,
          machineImage: "nginx:1.27-alpine",
          orgSlug: "personal",
          provider: "fly",
          region: "syd"
        },
        fetchImpl: fetchMock,
        files,
        token: "fly_token"
      })
    ).resolves.toEqual({
      machineId: "machine_123",
      previewUrl: "https://miaochat-container.fly.dev"
    });
  });
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: {
      "Content-Type": "application/json"
    },
    status
  });
}
