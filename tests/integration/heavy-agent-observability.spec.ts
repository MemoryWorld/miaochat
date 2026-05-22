import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { Client } from "pg";

import { createApp } from "../../apps/api/src/main.js";
import { signupSessionViaInject } from "../support/auth-session.js";
import { HeavyAgentMetricsService } from "../../apps/api/src/modules/tools/heavy-agent-metrics.service.js";
import { MetricsRegistry } from "../../apps/api/src/observability/metrics-registry.service.js";

const userPrefix = "heavy-agent-observability";

describe("heavy agent observability", () => {
  let app: NestFastifyApplication;
  let client: Client;

  beforeAll(async () => {
    client = new Client({
      connectionString:
        process.env.DATABASE_URL ?? "postgres://agenthub:agenthub@localhost:5432/agenthub"
    });
    await client.connect();
    await clearFixtures(client);

    app = await createApp();
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterEach(async () => {
    await clearFixtures(client);
  });

  afterAll(async () => {
    await app.close();
    await clearFixtures(client);
    await client.end();
  });

  it("emits counters and audit entries for executions and registrations", async () => {
    const session = await signupSessionViaInject(app, {
      displayName: "Heavy Agent Obs",
      email: `${userPrefix}-${Date.now()}@example.com`
    });

    const metricsService = app.get(HeavyAgentMetricsService);
    const registry = app.get(MetricsRegistry);
    registry.reset();

    metricsService.recordExecution({
      agentId: "agent_heavy_obs",
      coldStart: true,
      durationMs: 250,
      outcome: "completed",
      toolInvocations: 3,
      workspaceId: "default-workspace",
      workspaceOwnerUserId: session.user.id
    });
    metricsService.recordExecution({
      agentId: "agent_heavy_obs",
      coldStart: false,
      durationMs: 80,
      outcome: "quota_exceeded",
      toolInvocations: 0,
      workspaceId: "default-workspace",
      workspaceOwnerUserId: session.user.id
    });

    const snapshot = registry.snapshot();
    const counterNames = snapshot.counters.map((counter) => counter.name);
    expect(counterNames).toEqual(
      expect.arrayContaining([
        "heavy_agent_execution_total",
        "heavy_agent_cold_start_total",
        "heavy_agent_tool_invocation_total",
        "heavy_agent_quota_exceeded_total"
      ])
    );

    await metricsService.recordRegistration({
      actorUserId: session.user.id,
      agentId: "agent_heavy_obs",
      workspaceId: "default-workspace",
      workspaceOwnerUserId: session.user.id
    });

    const audit = await app.inject({
      headers: { cookie: session.cookie },
      method: "GET",
      url: "/workspaces/default-workspace/audit"
    });
    expect(audit.statusCode).toBe(200);
    const events = (audit.json() as { events: Array<{ details: { kind?: string } }> })
      .events;
    expect(events.some((event) => event.details?.kind === "heavy_agent.registration")).toBe(
      true
    );
  });
});

async function clearFixtures(client: Client): Promise<void> {
  await client.query(
    `DELETE FROM users WHERE email LIKE '${userPrefix}-%@example.com'`
  );
}
