import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { Client } from "pg";
import request from "supertest";

import { createApp } from "../src/main.js";

export const contractPassword = "S3curePass!123";

export type ContractSession = {
  cookie: string;
  user: {
    displayName: string;
    email: string;
    id: string;
  };
};

export async function createContractApp(): Promise<NestFastifyApplication> {
  const app = await createApp();
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return app;
}

export function createDatabaseClient(): Client {
  return new Client({
    connectionString:
      process.env.DATABASE_URL ?? "postgres://agenthub:agenthub@localhost:5432/agenthub"
  });
}

export function apiRequest(app: NestFastifyApplication) {
  return request(app.getHttpServer());
}

export async function signupViaSupertest(
  app: NestFastifyApplication,
  input: {
    displayName: string;
    email: string;
    password?: string;
  }
): Promise<ContractSession> {
  const response = await apiRequest(app).post("/auth/signup").send({
    ...input,
    password: input.password ?? contractPassword
  });

  if (response.status !== 201) {
    throw new Error(
      `Expected signup to succeed, received ${response.status}: ${response.text}`
    );
  }

  return {
    cookie: extractCookieHeader(response.headers["set-cookie"]),
    user: response.body.user as ContractSession["user"]
  };
}

export async function loginViaSupertest(
  app: NestFastifyApplication,
  input: {
    email: string;
    password?: string;
  }
): Promise<ContractSession> {
  const response = await apiRequest(app).post("/auth/login").send({
    email: input.email,
    password: input.password ?? contractPassword
  });

  if (response.status !== 200) {
    throw new Error(
      `Expected login to succeed, received ${response.status}: ${response.text}`
    );
  }

  return {
    cookie: extractCookieHeader(response.headers["set-cookie"]),
    user: response.body.user as ContractSession["user"]
  };
}

function extractCookieHeader(header: string | string[] | undefined): string {
  if (Array.isArray(header)) {
    return header[0] ?? "";
  }

  return header ?? "";
}
