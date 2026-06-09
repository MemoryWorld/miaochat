import { describe, expect, it } from "vitest";

import {
  getMissingDeployAcceptanceVariables,
  readDeployAcceptanceEnvironment,
  runRealDeployAcceptance
} from "../scripts/deploy/support.js";

describe("real deploy acceptance support", () => {
  it("reports the provider variables required for a full real deploy acceptance run", () => {
    const environment = readDeployAcceptanceEnvironment({
      MIAOCHAT_DEPLOY_RUN_ID: "test123"
    });

    expect(getMissingDeployAcceptanceVariables(environment)).toEqual([
      "FLY_API_TOKEN",
      "S3_ACCESS_KEY",
      "S3_BUCKET",
      "S3_ENDPOINT",
      "S3_PUBLIC_BASE_URL",
      "S3_REGION",
      "S3_SECRET_KEY",
      "VERCEL_TOKEN"
    ]);
  });

  it("drives the API deploy flow and verifies public URLs without exposing secrets", async () => {
    const environment = readDeployAcceptanceEnvironment({
      FLY_API_TOKEN: "fly_secret",
      MIAOCHAT_DEPLOY_RUN_ID: "test123",
      S3_ACCESS_KEY: "s3_access",
      S3_BUCKET: "acceptance-bucket",
      S3_ENDPOINT: "https://s3.example.test",
      S3_PUBLIC_BASE_URL: "https://public.example.test/acceptance-bucket",
      S3_REGION: "auto",
      S3_SECRET_KEY: "s3_secret",
      VERCEL_TOKEN: "vercel_secret"
    });
    const calls: Array<{ init?: RequestInit; input: RequestInfo | URL }> = [];
    const responses = [
      jsonResponse(
        {
          user: {
            email: "deploy-acceptance@example.com",
            id: "user_acceptance"
          }
        },
        201,
        {
          "Set-Cookie": "agenthub_session=session_value; Path=/; HttpOnly"
        }
      ),
      jsonResponse({ id: "agent_acceptance" }, 201),
      jsonResponse({ id: "conversation_acceptance" }, 201),
      jsonResponse({ id: "message_acceptance" }, 201),
      jsonResponse(
        {
          artifactId: "artifact_acceptance",
          previewUrl: null,
          storageKey:
            "artifacts/default-workspace/message_acceptance/artifact_acceptance/miaochat-test123.deploy.json",
          uploadHeaders: {
            "content-type": "application/json"
          },
          uploadMethod: "PUT",
          uploadUrl: "https://upload.example.test/object"
        },
        201
      ),
      new Response("", { status: 200 }),
      jsonResponse({ id: "artifact_acceptance" }, 201),
      jsonResponse({ name: "vercel-static-test123" }, 201),
      jsonResponse({ name: "fly-container-test123" }, 201),
      jsonResponse({ name: "s3-source-test123" }, 201),
      jsonResponse(deployResponse("deployment_static", "static-site", "https://static.example.test")),
      new Response("test123 static ok", { status: 200 }),
      jsonResponse(deployResponse("deployment_container", "container", "https://container.example.test")),
      new Response("test123 container ok", { status: 200 }),
      jsonResponse(deployResponse("deployment_source", "source-archive", "https://source.example.test")),
      new Response("test123 source ok", { status: 200 })
    ];

    const result = await runRealDeployAcceptance({
      environment,
      fetchImpl: async (input, init) => {
        calls.push({ init, input });
        const response = responses.shift();

        if (!response) {
          throw new Error(`Unexpected fetch invocation: ${String(input)}`);
        }

        return response;
      }
    });

    expect(calls).toHaveLength(16);
    expect(calls[1]?.init?.headers).toEqual(
      expect.objectContaining({
        Cookie: "agenthub_session=session_value"
      })
    );
    expect(calls.map((call) => String(call.input))).toEqual([
      "http://localhost:3001/auth/signup",
      "http://localhost:3001/custom-agents",
      "http://localhost:3001/conversations",
      "http://localhost:3001/messages",
      "http://localhost:3001/artifacts/upload-target",
      "https://upload.example.test/object",
      "http://localhost:3001/artifacts",
      "http://localhost:3001/deploys/targets",
      "http://localhost:3001/deploys/targets",
      "http://localhost:3001/deploys/targets",
      "http://localhost:3001/deploys",
      "https://static.example.test",
      "http://localhost:3001/deploys",
      "https://container.example.test",
      "http://localhost:3001/deploys",
      "https://source.example.test"
    ]);
    expect(result.deployments).toHaveLength(3);
    expect(result.deployments.every((deployment) => deployment.publicUrlVerified)).toBe(
      true
    );
    expect(result.cleanup.vercelProjects).toEqual(["miaochat-static-test123"]);
    expect(result.cleanup.flyApps).toEqual(["miaochat-container-test123"]);
    expect(result.cleanup.s3Keys).toEqual([
      "deployments/source-archives/default-workspace/deployment_source/miaochat-test123.deploy.json"
    ]);
    expect(JSON.stringify(result)).not.toContain("vercel_secret");
    expect(JSON.stringify(result)).not.toContain("fly_secret");
  });
});

function deployResponse(id: string, targetKind: string, previewUrl: string): unknown {
  return {
    artifact: {
      id: "artifact_acceptance"
    },
    deployment: {
      id,
      previewUrl,
      resultMessage: `${targetKind} deployed`,
      status: "succeeded",
      targetKind
    },
    target: {
      name: `${targetKind}-target`
    }
  };
}

function jsonResponse(
  payload: unknown,
  status = 200,
  headers: Record<string, string> = {}
): Response {
  return new Response(JSON.stringify(payload), {
    headers: {
      "Content-Type": "application/json",
      ...headers
    },
    status
  });
}
