import type { NestFastifyApplication } from "@nestjs/platform-fastify";

export const testSessionPassword = "S3curePass!123";

export type AuthenticatedTestSession = {
  cookie: string;
  user: {
    displayName: string;
    email: string;
    id: string;
  };
};

export async function signupSessionViaInject(
  app: NestFastifyApplication,
  input: {
    displayName: string;
    email: string;
    password?: string;
  }
): Promise<AuthenticatedTestSession> {
  const response = await app.inject({
    method: "POST",
    payload: {
      ...input,
      password: input.password ?? testSessionPassword
    },
    url: "/auth/signup"
  });

  if (response.statusCode !== 201) {
    throw new Error(
      `Expected signup to succeed, received ${response.statusCode}: ${response.body}`
    );
  }

  return {
    cookie: extractCookieHeader(response.headers["set-cookie"]),
    user: response.json().user as AuthenticatedTestSession["user"]
  };
}

export async function signupSessionViaFetch(
  baseUrl: string,
  input: {
    displayName: string;
    email: string;
    password?: string;
  }
): Promise<AuthenticatedTestSession> {
  const response = await fetch(`${baseUrl}/auth/signup`, {
    body: JSON.stringify({
      ...input,
      password: input.password ?? testSessionPassword
    }),
    headers: {
      "Content-Type": "application/json"
    },
    method: "POST"
  });

  if (response.status !== 201) {
    throw new Error(
      `Expected signup to succeed, received ${response.status}: ${await response.text()}`
    );
  }

  return {
    cookie: extractCookieHeader(response.headers.get("set-cookie")),
    user: (await response.json()).user as AuthenticatedTestSession["user"]
  };
}

export function extractCookieHeader(header: string | string[] | null | undefined): string {
  if (Array.isArray(header)) {
    return header[0] ?? "";
  }

  return header ?? "";
}
