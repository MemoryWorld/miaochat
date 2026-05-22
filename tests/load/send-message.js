import http from "k6/http";
import { check, sleep } from "k6";
import { SharedArray } from "k6/data";
import { Trend } from "k6/metrics";

const baseUrl = __ENV.AGENTHUB_API_BASE_URL || "http://localhost:3001";
const workspaceId = __ENV.AGENTHUB_WORKSPACE_ID || "default-workspace";
const conversationIds = new SharedArray("conversation_ids", () =>
  (__ENV.AGENTHUB_LOAD_CONVERSATION_IDS || "")
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0)
);

const sendLatency = new Trend("send_message_latency_ms");

export const options = {
  scenarios: {
    sustained_message_submit: {
      executor: "constant-arrival-rate",
      duration: "5m",
      preAllocatedVUs: 1500,
      maxVUs: 3000,
      rate: 750,
      timeUnit: "1s"
    }
  },
  thresholds: {
    http_req_duration: ["p(95)<800"],
    http_req_failed: ["rate<0.02"],
    send_message_latency_ms: ["p(95)<800", "p(99)<1500"]
  }
};

export default function sendMessageScenario() {
  if (conversationIds.length === 0) {
    throw new Error(
      "Set AGENTHUB_LOAD_CONVERSATION_IDS to a comma-separated list of pre-seeded conversations."
    );
  }

  const conversationId = conversationIds[__VU % conversationIds.length];
  const response = http.post(
    `${baseUrl}/messages/send`,
    JSON.stringify({
      content: `Load probe ${__ITER}-${__VU}`,
      conversationId,
      role: "user",
      workspaceId
    }),
    {
      headers: { "Content-Type": "application/json" },
      tags: { endpoint: "send-message" }
    }
  );

  sendLatency.add(response.timings.duration);

  check(response, {
    "status is 202 or 429": (resp) => resp.status === 202 || resp.status === 429,
    "rate-limited responses include retry-after hint": (resp) => {
      if (resp.status !== 429) {
        return true;
      }
      try {
        const payload = resp.json();
        return typeof payload.retryAfterMs === "number";
      } catch (error) {
        return false;
      }
    }
  });

  sleep(0.2);
}
