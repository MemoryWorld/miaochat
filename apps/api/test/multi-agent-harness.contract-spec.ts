import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import type { Client } from "pg";

import {
  apiRequest,
  createContractApp,
  createDatabaseClient,
  signupViaSupertest
} from "./contract-support.js";

const emailPrefix = "multi-agent-harness-contract";
const workspaceId = "workspace_multi_agent_harness_contract";
const agentIds = {
  engineer: "agent_harness_contract_engineer",
  lead: "agent_harness_contract_lead"
};

describe("multi-agent harness api contract", () => {
  let app: NestFastifyApplication;
  let client: Client;

  beforeAll(async () => {
    client = createDatabaseClient();
    await client.connect();
    await clearFixtures(client);
    app = await createContractApp();
  });

  afterEach(async () => {
    await clearFixtures(client);
  });

  afterAll(async () => {
    await app.close();
    await clearFixtures(client);
    await client.end();
  });

  it("mirrors channel messages into harness events and materializes AI participants", async () => {
    const owner = await signupViaSupertest(app, {
      displayName: "Harness Owner",
      email: `${emailPrefix}-owner-${Date.now()}@example.com`
    });
    await seedAgents(client, owner.user.id);

    const conversationResponse = await apiRequest(app)
      .post("/conversations")
      .set("Cookie", owner.cookie)
      .send({
        agentIds: [agentIds.lead, agentIds.engineer],
        mode: "group",
        workspaceId
      });

    expect(conversationResponse.status).toBe(201);
    const conversationId = conversationResponse.body.id as string;

    const messageResponse = await apiRequest(app)
      .post("/messages")
      .set("Cookie", owner.cookie)
      .send({
        content: "@Engineer 请接手实现",
        conversationId,
        mentionedAgentIds: [agentIds.engineer],
        role: "user",
        workspaceId
      });

    expect(messageResponse.status).toBe(201);

    const participantsResponse = await apiRequest(app)
      .get(`/channels/${conversationId}/participants`)
      .query({ workspaceId })
      .set("Cookie", owner.cookie);

    expect(participantsResponse.status).toBe(200);
    expect(participantsResponse.body).toEqual([
      expect.objectContaining({
        agentId: agentIds.engineer,
        roleKey: "software-engineer",
        roleTags: ["role:software_engineer"]
      }),
      expect.objectContaining({
        agentId: agentIds.lead,
        roleKey: "tech-lead",
        roleTags: ["role:tech_lead", "channel:coordinator"]
      })
    ]);

    const eventsResponse = await apiRequest(app)
      .get(`/channels/${conversationId}/events`)
      .query({ workspaceId })
      .set("Cookie", owner.cookie);

    expect(eventsResponse.status).toBe(200);
    expect(eventsResponse.body).toEqual([
      expect.objectContaining({
        authorType: "human",
        content: "@Engineer 请接手实现",
        mentions: [
          expect.objectContaining({
            kind: "agent",
            targetParticipantIds: [
              `participant:${conversationId}:${agentIds.engineer}`
            ]
          })
        ],
        type: "user_message"
      })
    ]);

    await seedAgentRunLedger(client, conversationId);

    const agentRunsResponse = await apiRequest(app)
      .get(`/channels/${conversationId}/agent-runs`)
      .query({ workspaceId })
      .set("Cookie", owner.cookie);

    expect(agentRunsResponse.status).toBe(200);
    expect(agentRunsResponse.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          agentId: agentIds.engineer,
          checkpoint: "context_prepared",
          metadata: { checkpointSource: "contract-test" },
          status: "running",
          turnId: "turn:contract:engineer"
        })
      ])
    );

    const activityResponse = await apiRequest(app)
      .get("/activity")
      .query({ channelId: conversationId, workspaceId })
      .set("Cookie", owner.cookie);

    expect(activityResponse.status).toBe(200);
    expect(activityResponse.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actingTeammateId: agentIds.engineer,
          actingTeammateName: "Engineer",
          channelId: conversationId,
          conversationId,
          id: "agent-run-activity:agent-run:contract:engineer",
          metadata: expect.objectContaining({
            checkpoint: "context_prepared",
            checkpointSource: "contract-test",
            source: "agent_run_ledger",
            turnId: "turn:contract:engineer"
          }),
          phase: "coordination",
          status: "running",
          summary: "Engineer 正在处理本轮协作。",
          workflowId: null
        })
      ])
    );
  });
});

async function clearFixtures(client: Client): Promise<void> {
  await client.query("DELETE FROM conversations WHERE workspace_id = $1", [workspaceId]);
  await client.query("DELETE FROM custom_agents WHERE workspace_id = $1", [workspaceId]);
  await client.query(`DELETE FROM users WHERE email LIKE '${emailPrefix}-%@example.com'`);
}

async function seedAgentRunLedger(
  client: Client,
  conversationId: string
): Promise<void> {
  await client.query(
    `
      INSERT INTO agent_run_ledger (
        id,
        workspace_id,
        channel_id,
        agent_id,
        provider,
        turn_id,
        status,
        checkpoint,
        context_snapshot_id,
        produced_event_ids,
        artifact_count,
        metadata
      )
      VALUES (
        'agent-run:contract:engineer',
        $1,
        $2,
        $3,
        'mock',
        'turn:contract:engineer',
        'running',
        'context_prepared',
        null,
        '[]'::jsonb,
        0,
        '{"checkpointSource":"contract-test"}'::jsonb
      )
      ON CONFLICT (id) DO UPDATE
        SET updated_at = now()
    `,
    [workspaceId, conversationId, agentIds.engineer]
  );
}

async function seedAgents(client: Client, ownerUserId: string): Promise<void> {
  await client.query(
    `
      INSERT INTO custom_agents (
        id,
        avatar_url,
        capability_tags,
        name,
        owner_user_id,
        provider,
        system_prompt,
        tool_bindings,
        workspace_id
      )
      VALUES
        ($1, null, '["role:tech_lead","channel:coordinator"]'::jsonb, 'Lead', $3, 'mock', 'Plan', '[]'::jsonb, $4),
        ($2, null, '["role:software_engineer"]'::jsonb, 'Engineer', $3, 'mock', 'Build', '[]'::jsonb, $4)
      ON CONFLICT DO NOTHING
    `,
    [agentIds.lead, agentIds.engineer, ownerUserId, workspaceId]
  );
}
