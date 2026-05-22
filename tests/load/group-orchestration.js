import http from "k6/http";
import { check, sleep } from "k6";
import { SharedArray } from "k6/data";
import { Counter, Trend } from "k6/metrics";

const baseUrl = __ENV.AGENTHUB_API_BASE_URL || "http://localhost:3001";
const workspaceId = __ENV.AGENTHUB_WORKSPACE_ID || "default-workspace";
const conversationIds = new SharedArray("group_conversation_ids", () =>
  (__ENV.AGENTHUB_LOAD_GROUP_CONVERSATION_IDS || "")
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0)
);

const orchestrationLatency = new Trend("group_orchestration_latency_ms");
const partialFailures = new Counter("group_orchestration_partial_failures");

export const options = {
  scenarios: {
    concurrent_group_orchestration: {
      executor: "ramping-arrival-rate",
      preAllocatedVUs: 250,
      maxVUs: 500,
      stages: [
        { duration: "60s", target: 100 },
        { duration: "60s", target: 250 },
        { duration: "120s", target: 500 },
        { duration: "60s", target: 500 },
        { duration: "30s", target: 0 }
      ],
      startRate: 25,
      timeUnit: "1s"
    }
  },
  thresholds: {
    http_req_duration: ["p(95)<1500"],
    http_req_failed: ["rate<0.05"],
    group_orchestration_latency_ms: ["p(95)<1500", "p(99)<3000"]
  }
};

export default function groupOrchestrationScenario() {
  if (conversationIds.length === 0) {
    throw new Error(
      "Set AGENTHUB_LOAD_GROUP_CONVERSATION_IDS to a comma-separated list of pre-seeded group conversations."
    );
  }

  const conversationId = conversationIds[__VU % conversationIds.length];
  const response = http.post(
    `${baseUrl}/messages/send`,
    JSON.stringify({
      content: `Plan release sub-task ${__ITER}-${__VU}`,
      conversationId,
      role: "user",
      workspaceId
    }),
    {
      headers: { "Content-Type": "application/json" },
      tags: { endpoint: "group-orchestration" }
    }
  );

  orchestrationLatency.add(response.timings.duration);

  if (response.status === 202) {
    try {
      const payload = response.json();
      if (payload?.code === "partial_failure") {
        partialFailures.add(1);
      }
    } catch (error) {
      // Body parsing failures do not invalidate the test run.
    }
  }

  check(response, {
    "status is 202 or 429": (resp) => resp.status === 202 || resp.status === 429,
    "no 5xx responses": (resp) => resp.status < 500
  });

  sleep(0.5);
}
