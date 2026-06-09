import { describe, expect, it, vi } from "vitest";

import { createMobileApiClient } from "../src/lib/mobile-api.js";

describe("mobile api client", () => {
  it("uses existing Miaochat endpoints for mobile conversation and approval flows", async () => {
    const calls: Array<{
      body?: string;
      headers?: RequestInit["headers"];
      method: string;
      url: string;
    }> = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({
        body: typeof init?.body === "string" ? init.body : undefined,
        headers: init?.headers,
        method: init?.method ?? "GET",
        url: String(input)
      });

      return new Response(JSON.stringify([]), {
        headers: {
          "Content-Type": "application/json"
        },
        status: 200
      });
    });
    const api = createMobileApiClient({
      baseUrl: "https://api.example.test/",
      fetchImpl: fetchMock as typeof fetch
    });

    await api.listConversations("workspace_mobile");
    await api.listMessages({
      conversationId: "conv_mobile",
      workspaceId: "workspace_mobile"
    });
    await api.listApprovals({
      conversationId: "conv_mobile",
      workspaceId: "workspace_mobile"
    });
    await api.decideWorkflow({
      decision: "approved",
      workflowId: "workflow_mobile",
      workspaceId: "workspace_mobile"
    });

    expect(calls.map((call) => `${call.method} ${call.url}`)).toEqual([
      "GET https://api.example.test/conversations?workspaceId=workspace_mobile",
      "GET https://api.example.test/messages?conversationId=conv_mobile&workspaceId=workspace_mobile",
      "GET https://api.example.test/approvals?workspaceId=workspace_mobile&channelId=conv_mobile",
      "POST https://api.example.test/coding-workflows/workflow_mobile/decisions"
    ]);
    expect(JSON.parse(calls[3]?.body ?? "{}")).toEqual({
      decision: "approved",
      workspaceId: "workspace_mobile"
    });
  });

  it("normalizes the auth login response into the mobile session shape", async () => {
    const calls: RequestInit[] = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push(init ?? {});

      if (String(input).endsWith("/auth/login")) {
        return new Response(
          JSON.stringify({
            session: {
              expiresAt: "2026-07-05T00:00:00.000Z"
            },
            user: {
              displayName: "比赛用户",
              email: "demo@example.com",
              id: "user_demo"
            }
          }),
          {
            headers: {
              "Content-Type": "application/json",
              "Set-Cookie": "agenthub_session=session_123; HttpOnly; Path=/"
            },
            status: 200
          }
        );
      }

      return new Response(JSON.stringify([]), {
        headers: {
          "Content-Type": "application/json"
        },
        status: 200
      });
    });
    const api = createMobileApiClient({
      baseUrl: "https://api.example.test",
      fetchImpl: fetchMock as typeof fetch
    });

    await expect(
      api.login({
        email: "demo@example.com",
        password: "password-1234"
      })
    ).resolves.toEqual({
      authenticated: true,
      user: {
        displayName: "比赛用户",
        email: "demo@example.com",
        id: "user_demo"
      }
    });
    await api.listConversations("workspace_mobile");

    expect(calls[1]?.headers).toMatchObject({
      Cookie: "agenthub_session=session_123"
    });
  });
});
