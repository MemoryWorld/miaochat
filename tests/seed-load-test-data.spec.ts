import { describe, expect, it } from "vitest";

import { seedLoadTestData } from "../scripts/staging/seed-load-test-data-lib.js";

describe("seedLoadTestData", () => {
  it("creates mock agents and conversations, then returns load-test exports", async () => {
    const fetchCalls: Array<{ init?: RequestInit; input: RequestInfo | URL }> = [];
    const responses = [
      new Response(
        JSON.stringify({
          session: { expiresAt: "2026-06-25T00:00:00.000Z" },
          user: { displayName: "Load Seeder", email: "seed@example.com", id: "user_seed" }
        }),
        {
          headers: {
            "Content-Type": "application/json",
            "Set-Cookie": "agenthub_session=session_value; Path=/; HttpOnly"
          },
          status: 201
        }
      ),
      new Response(JSON.stringify({ id: "agent_direct" }), {
        headers: { "Content-Type": "application/json" },
        status: 201
      }),
      new Response(JSON.stringify({ id: "agent_group_a" }), {
        headers: { "Content-Type": "application/json" },
        status: 201
      }),
      new Response(JSON.stringify({ id: "agent_group_b" }), {
        headers: { "Content-Type": "application/json" },
        status: 201
      }),
      new Response(JSON.stringify({ id: "conv_direct_1" }), {
        headers: { "Content-Type": "application/json" },
        status: 201
      }),
      new Response(JSON.stringify({ id: "conv_group_1" }), {
        headers: { "Content-Type": "application/json" },
        status: 201
      }),
      new Response(JSON.stringify({ id: "conv_stream_1" }), {
        headers: { "Content-Type": "application/json" },
        status: 201
      })
    ];

    const result = await seedLoadTestData({
      apiBaseUrl: "https://api.example.test",
      directConversationCount: 1,
      fetchImpl: async (input, init) => {
        fetchCalls.push({ init, input });
        const response = responses.shift();

        if (!response) {
          throw new Error("Unexpected fetch invocation.");
        }

        return response;
      },
      groupConversationCount: 1,
      now: () => 1_717_000_000_000,
      streamConversationCount: 1,
      workspaceId: "default-workspace"
    });

    expect(fetchCalls).toHaveLength(7);
    expect(fetchCalls[1]?.init?.headers).toEqual(
      expect.objectContaining({
        Cookie: "agenthub_session=session_value"
      })
    );
    expect(result.directConversationIds).toEqual(["conv_direct_1"]);
    expect(result.groupConversationIds).toEqual(["conv_group_1"]);
    expect(result.streamConversationIds).toEqual(["conv_stream_1"]);
    expect(result.exports).toContain(
      "export AGENTHUB_LOAD_GROUP_CONVERSATION_IDS=conv_group_1"
    );
  });
});
