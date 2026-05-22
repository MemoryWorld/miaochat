import http from "k6/http";
import { check, sleep } from "k6";
import { SharedArray } from "k6/data";
import { Counter, Trend } from "k6/metrics";

const baseUrl = __ENV.AGENTHUB_API_BASE_URL || "http://localhost:3001";
const workspaceId = __ENV.AGENTHUB_WORKSPACE_ID || "default-workspace";
const conversationIds = new SharedArray("stream_conversation_ids", () =>
  (__ENV.AGENTHUB_LOAD_STREAM_CONVERSATION_IDS || "")
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0)
);

const sseConnectLatency = new Trend("sse_connect_latency_ms");
const sseDisconnects = new Counter("sse_disconnects");
const sseSuccessfulConnections = new Counter("sse_successful_connections");

export const options = {
  scenarios: {
    long_lived_stream_clients: {
      executor: "ramping-vus",
      gracefulRampDown: "30s",
      stages: [
        { duration: "60s", target: 500 },
        { duration: "120s", target: 1500 },
        { duration: "240s", target: 3000 },
        { duration: "120s", target: 3000 },
        { duration: "60s", target: 0 }
      ],
      startVUs: 0
    }
  },
  thresholds: {
    http_req_duration: ["p(95)<800"],
    sse_connect_latency_ms: ["p(95)<800", "p(99)<1500"],
    sse_disconnects: ["count<150"]
  }
};

export default function streamStabilityScenario() {
  if (conversationIds.length === 0) {
    throw new Error(
      "Set AGENTHUB_LOAD_STREAM_CONVERSATION_IDS to a comma-separated list of pre-seeded conversations."
    );
  }

  const conversationId = conversationIds[__VU % conversationIds.length];
  const response = http.get(
    `${baseUrl}/streams/${conversationId}?workspaceId=${workspaceId}`,
    {
      headers: { Accept: "text/event-stream" },
      tags: { endpoint: "stream-stability" },
      timeout: "60s"
    }
  );

  sseConnectLatency.add(response.timings.duration);

  if (response.status !== 200) {
    sseDisconnects.add(1);
  } else {
    sseSuccessfulConnections.add(1);
  }

  check(response, {
    "status is 200": (resp) => resp.status === 200,
    "content-type is text/event-stream": (resp) =>
      resp.headers["Content-Type"]?.includes("text/event-stream") === true
  });

  sleep(5);
}
