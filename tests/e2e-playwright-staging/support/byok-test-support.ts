import type { APIRequestContext, BrowserContext } from "@playwright/test";

import {
  getStagingByokCredential,
  type ProviderKey
} from "../../e2e/real-provider-test-support.js";

export type StagingByokSession = {
  cookieHeader: string;
  email: string;
};

type StagingCredential = {
  id: string;
  label: string;
  provider: ProviderKey;
  providerAccountId: string;
};

const workspaceId = "default-workspace";

export function createByokLabel(provider: ProviderKey): string {
  return `${provider}-browser-${Date.now()}`;
}

export function getStagingApiBaseUrl(): string {
  return requireEnv("AGENTHUB_API_BASE_URL");
}

export function getWorkspaceId(): string {
  return workspaceId;
}

export function getStagingCredentialDraft(provider: ProviderKey) {
  return {
    ...getStagingByokCredential(provider),
    label: createByokLabel(provider)
  };
}

export async function createAuthenticatedStagingSession(
  request: APIRequestContext,
  browserContext: BrowserContext
): Promise<StagingByokSession> {
  const email = `staging-byok-${Date.now()}@example.com`;
  const password = "S3curePass!123";
  const response = await request.post(`${getStagingApiBaseUrl()}/auth/signup`, {
    data: {
      displayName: "Staging BYOK",
      email,
      password
    }
  });

  if (response.status() !== 201) {
    throw new Error(
      `Expected signup to succeed, received ${response.status()}: ${await response.text()}`
    );
  }

  const setCookie = response.headers()["set-cookie"];
  const sessionCookie = parseSessionCookie(setCookie);

  await browserContext.addCookies([
    {
      domain: new URL(getStagingApiBaseUrl()).hostname,
      httpOnly: true,
      name: sessionCookie.name,
      path: "/",
      sameSite: "Lax",
      secure: new URL(getStagingApiBaseUrl()).protocol === "https:",
      value: sessionCookie.value
    }
  ]);

  return {
    cookieHeader: `${sessionCookie.name}=${sessionCookie.value}`,
    email
  };
}

export async function cleanupStagingCredential(
  request: APIRequestContext,
  session: StagingByokSession,
  provider: ProviderKey,
  label: string
): Promise<void> {
  const listResponse = await request.get(
    `${getStagingApiBaseUrl()}/credentials?workspaceId=${workspaceId}`,
    {
      headers: {
        Cookie: session.cookieHeader
      }
    }
  );

  if (listResponse.status() !== 200) {
    throw new Error(
      `Expected credential list to succeed during cleanup, received ${listResponse.status()}: ${await listResponse.text()}`
    );
  }

  const credentials = (await listResponse.json()) as StagingCredential[];
  const match = credentials.find(
    (credential) => credential.label === label && credential.provider === provider
  );

  if (!match) {
    return;
  }

  const deleteResponse = await request.delete(
    `${getStagingApiBaseUrl()}/credentials/${match.id}?workspaceId=${workspaceId}`,
    {
      headers: {
        Cookie: session.cookieHeader
      }
    }
  );

  if (deleteResponse.status() !== 200) {
    throw new Error(
      `Expected credential cleanup to succeed, received ${deleteResponse.status()}: ${await deleteResponse.text()}`
    );
  }
}

function parseSessionCookie(header: string | undefined): { name: string; value: string } {
  if (!header) {
    throw new Error("Expected auth signup response to include a session cookie.");
  }

  const [firstSegment = ""] = header.split(";");
  const [name = "", value = ""] = firstSegment.split("=");

  if (!name || !value) {
    throw new Error(`Could not parse session cookie from header: ${header}`);
  }

  return { name, value };
}

function requireEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required staging environment variable: ${name}`);
  }

  return value;
}
